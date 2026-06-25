# SmartGrid Monitoring & Observability

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  EKS Cluster — production namespace                                  │
│                                                                      │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────┐            │
│  │ auth-service│  │consumer-service│  │  meter-service │            │
│  │  :3001      │  │  :3002         │  │  :3003         │            │
│  │  GET /metrics│  │  GET /metrics  │  │  GET /metrics  │            │
│  └──────┬──────┘  └───────┬───────┘  └───────┬────────┘            │
│         │                 │                   │                      │
│  ┌──────┴──────┐  ┌───────┴───────┐  ┌───────┴────────┐            │
│  │billing-svc  │  │  alert-service│  │ai-assistant-svc│            │
│  │  :3004      │  │  :3005        │  │  :4004         │            │
│  │  GET /metrics│  │  GET /metrics │  │  GET /metrics  │            │
│  └──────┬──────┘  └───────┬───────┘  └───────┬────────┘            │
│         └────────────┬────┘                   │                      │
│                      │         ServiceMonitor  │                      │
│                      ▼         (scrape config) │                      │
│              ┌───────────────┐◄────────────────┘                    │
│              │  Prometheus   │                                        │
│              │  (30s scrape) │                                        │
│              └───────┬───────┘                                        │
│                      │  PrometheusRule (12 alerts)                    │
│                      ▼                                                │
│              ┌───────────────┐       ┌─────────────────────┐         │
│              │ Alertmanager  │──────►│ Email (Gmail SMTP)  │         │
│              │               │       │fitnessofficialasad  │         │
│              └───────────────┘       │   @gmail.com        │         │
│                      │               └─────────────────────┘         │
│                      │                                                │
│              ┌───────▼───────┐                                        │
│              │    Grafana    │  3 dashboards (auto-imported           │
│              │               │  via ConfigMap sidecar)               │
│              └───────────────┘                                        │
│                                                                      │
│  monitoring namespace:                                               │
│    kube-prometheus-stack (Prometheus Operator + components above)    │
│    node-exporter (DaemonSet — per-node CPU/memory/disk metrics)      │
│    kube-state-metrics (Deployment-level Kubernetes object metrics)   │
└─────────────────────────────────────────────────────────────────────┘
```

## Metric Collection

### Library

All 6 Node.js/Express services use **prom-client** (npm `^15.1.3`). Metrics are collected in a shared module at `shared/metrics/index.js` and exported from each service's `GET /metrics` endpoint.

The shared module uses `client.collectDefaultMetrics()` which automatically exposes:
- Node.js event loop lag
- GC duration and count
- Heap used/total/external
- Process CPU and memory
- Active file descriptor count

### Scraping

Prometheus scrapes every service every **30 seconds** via `ServiceMonitor` CRDs. The `release: kube-prometheus-stack` label is required on every ServiceMonitor and PrometheusRule for the Prometheus Operator to pick them up.

**Why 30s**: Default Prometheus interval is 60s. 30s doubles the resolution for faster alerting without significantly increasing storage. At 30s with 6 services, Prometheus handles ~2 scrapes/second — well within capacity for t3.small.

### Route normalisation

HTTP metrics use `route` as a label. Dynamic segments are normalised before labelling:
- `/api/consumers/42` → `/api/consumers/:id`
- `/api/meters/M-001/readings` → `/api/meters/:id/readings`

Without normalisation, every unique consumer ID creates a new time series — a "cardinality explosion" that OOMs Prometheus.

---

## Metrics Reference

### HTTP Metrics (all 6 services)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | service, method, route, status_code | Total HTTP requests |
| `http_errors_total` | Counter | service, method, route, status_code | HTTP errors (4xx and 5xx) |
| `http_request_duration_seconds` | Histogram | service, method, route, status_code | Request latency (bucket-based for percentiles) |

### auth-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `auth_login_attempts_total` | Counter | — | Total login attempts |
| `auth_login_failures_total` | Counter | reason | Failed logins, labelled by failure reason |
| `auth_token_validations_total` | Counter | result (valid/invalid/expired) | JWT validation outcomes |

### billing-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `bills_generated_total` | Counter | — | Successfully generated bills |
| `bill_generation_failures_total` | Counter | reason | Failed bill generation attempts |
| `bill_generation_duration_seconds` | Histogram | — | End-to-end bill generation time |

### meter-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `meter_readings_submitted_total` | Counter | meter_type | Successful meter reading submissions |
| `meter_reading_errors_total` | Counter | reason | Failed meter reading submissions |

### alert-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `notifications_sent_total` | Counter | type (email/sms) | Successfully delivered notifications |
| `notifications_failed_total` | Counter | type, reason | Failed notification deliveries |

### ai-assistant-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `ai_requests_total` | Counter | model | Bedrock requests by model ID |
| `ai_request_duration_seconds` | Histogram | — | Bedrock response latency |
| `ai_fallback_total` | Counter | — | Times Nova Lite fallback was used instead of Nova Pro |
| `textract_requests_total` | Counter | result (success/failure) | AWS Textract OCR call outcomes |

### consumer-service Business Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `consumer_lookups_total` | Counter | result (found/not_found) | Consumer profile lookup outcomes |

---

## Alert Thresholds and Justification

### Group 1: Service Availability

#### SmartGridServiceDown (critical)
- **Expression**: `up{namespace="production"} == 0` for 1m
- **Threshold**: Binary — any `up == 0`
- **Why 1 minute**: The Prometheus `up` metric flips to 0 immediately when a scrape fails. Waiting 1 minute avoids false positives during rolling deployments where a pod may be terminating (and not yet replaced) for up to 60 seconds. Alerting immediately would cause a critical fire on every deploy.

#### SmartGridPodCrashLooping (critical)
- **Expression**: `increase(kube_pod_container_status_restarts_total[15m]) > 3` for 0m
- **Threshold**: 3 restarts in 15 minutes
- **Why 3 restarts**: A single restart is normal (rolling deploy, transient OOM). Two restarts may be transient. Three restarts in 15 minutes is the Kubernetes CrashLoopBackOff pattern — the container cannot stay running. This mirrors the Kubernetes internal threshold for `CrashLoopBackOff` state.
- **Why 0m for**: We alert immediately when 3 restarts are seen — no additional waiting needed since the 15m window already provides debouncing.

#### SmartGridDeploymentReplicasMismatch (warning)
- **Expression**: `kube_deployment_spec_replicas != kube_deployment_status_replicas_ready` for 10m
- **Threshold**: Any mismatch sustained for 10 minutes
- **Why 10 minutes**: Rolling updates temporarily reduce ready replicas. The `maxUnavailable: 1` setting means during a 6-pod deploy, 5 pods are ready for ~2-3 minutes. 10 minutes indicates the new pods have failed to start (image pull error, OOMKilled, bad config) — this is beyond normal deploy time.

---

### Group 2: HTTP Error Rates

#### SmartGridHighErrorRate (warning)
- **Expression**: `rate(http_errors_total{status_code=~"5.."}[5m]) / rate(http_requests_total[5m]) * 100 > 5`
- **Threshold**: 5% of requests return 5xx errors for 5 minutes
- **Why 5%**: Google SRE Book defines error budgets at 0.1%–1% for high-SLA services. SmartGrid is a utility app (not a financial transaction system) where some retryable errors are acceptable. 5% is generous enough to avoid alert fatigue from transient database hiccups but low enough to catch real outages. If even 1 in 20 requests is failing, users are actively experiencing errors.
- **Why 5m window**: A 1-minute rate catches single-request spikes. 5 minutes confirms the issue is sustained, not a one-off Lambda cold-start or transient DB connection timeout.

#### SmartGridAuthFailureSpike (warning)
- **Expression**: `rate(auth_login_failures_total[5m]) * 60 > 20`
- **Threshold**: >20 login failures per minute
- **Why 20/min**: Normal user error rate (typos, forgotten passwords) is 1-3 failures/minute across all users at any given time. 20/minute sustained indicates automated credential stuffing or a brute-force attack against consumer electricity accounts. Triggering at 20/min gives the team time to block the source IP before account lockouts affect real users.

#### SmartGridBillingFailures (warning)
- **Expression**: `rate(bill_generation_failures_total[5m]) > 0`
- **Threshold**: Any sustained failure rate
- **Why 0**: Bill generation should be 100% reliable. A failed bill means a consumer cannot view their electricity statement on time, which may have regulatory implications for a utility provider. Unlike HTTP errors (where some are user mistakes), billing failures are always server-side problems requiring investigation. The 5-minute `for` duration prevents alerts from transient single failures.

---

### Group 3: Latency

#### SmartGridHighP95Latency (warning)
- **Expression**: `histogram_quantile(0.95, ...) > 2`
- **Threshold**: P95 response time > 2 seconds for 10 minutes
- **Why P95**: The arithmetic mean hides slow outliers — an average of 200ms can mask 5% of users waiting 4 seconds. P95 represents the experience of the 95th-percentile user. This is where user complaints originate. P99 would be too noisy; P50 would be too lenient.
- **Why 2 seconds**: Google's research on web performance shows users abandon pages taking longer than 2-3 seconds. For a React frontend calling these APIs, a 2s API response makes the UI feel sluggish. This aligns with the AWS well-architected framework's latency SLO guidance.
- **Why 10 minutes**: P95 latency spikes during traffic bursts and GC pauses. 10 minutes of sustained high latency means the service is genuinely overloaded — HPA may need time to scale up, or there is an inefficient query causing systemic slowness.

#### SmartGridAIResponseSlow (warning)
- **Expression**: `histogram_quantile(0.95, rate(ai_request_duration_seconds_bucket[5m])) > 30`
- **Threshold**: AI P95 > 30 seconds for 5 minutes
- **Why 30s (not 2s)**: AWS Bedrock Nova Pro processes multi-turn conversation context and can legitimately take 10-25 seconds. Applying the same 2s threshold as REST APIs would create constant noise. 30s is chosen because: (a) the ai-assistant-service has a 50s hard timeout, so 30s P95 leaves 20s of headroom before users hit 504 errors; (b) Bedrock throttling typically manifests as responses slowing beyond 30s before failing entirely.
- **Why 5m (not 10m)**: Bedrock throttling can degrade rapidly once it starts. 5 minutes of slow AI responses means many users are waiting too long — we want to alert before the 50s timeouts begin firing.

---

### Group 4: Resource Utilisation

#### SmartGridHighCPU (warning)
- **Expression**: `100 - (avg by(instance)(irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80`
- **Threshold**: Node CPU > 80% for 5 minutes
- **Why 80%**: Industry-standard threshold used by AWS (CloudWatch recommended alarms), Google Cloud, and Netflix. Below 80% there is sufficient headroom for Node.js garbage collection bursts and traffic spikes. At 100% CPU, the event loop stalls — since Node.js is single-threaded, a saturated CPU causes all services on that node to queue requests, creating a latency avalanche.
- **Why node-level (not pod-level)**: The 4 t3.small SPOT nodes share 2 vCPU / 2GB each. A single pod with CPU request of 250m can saturate a node if others are also active. Node-level CPU is the actual resource contention signal.
- **Why 5 minutes**: CPU naturally spikes during startup, GC, and burst traffic. 5 minutes sustained eliminates these transient spikes.

#### SmartGridHighMemory (warning)
- **Expression**: `(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85`
- **Threshold**: Node memory > 85% for 5 minutes
- **Why 85%**: Linux uses free memory for filesystem page cache (shown as "used" by most tools). The `MemAvailable` metric accounts for this — it represents memory actually available for new allocations. 85% usage of available memory means the node is genuinely low on memory. The remaining 15% (~300MB on t3.small with 2GB) is enough to absorb page cache but not enough to safely run new pods if one OOMKills.
- **Why not 90% or 95%**: Each pod has a memory limit of 512Mi. At 85% node memory, two pods attempting to approach their limits simultaneously would trigger OOMKills. 85% gives the team time to act before OOMKills cascade.

#### SmartGridPodMemoryNearLimit (warning)
- **Expression**: `container_memory_working_set_bytes / container_spec_memory_limit_bytes * 100 > 90`
- **Threshold**: Pod memory > 90% of its limit for 10 minutes
- **Why 90% of limit**: Each container is limited to 512Mi. At 90% (460Mi), the container is 52Mi from OOMKill. This gives the operations team time to investigate a memory leak before the container is killed by the kernel.
- **Why working_set_bytes (not rss)**: `working_set_bytes` = RSS + filesystem cache used by the process. Kubernetes uses this metric (not RSS) to trigger OOMKill — matching it in the alert ensures the alert fires before Kubernetes does.
- **Why 10 minutes**: Memory leaks grow gradually. 10 minutes at >90% confirms a genuine leak trend rather than a transient allocation spike.

---

### Group 5: Notification Delivery

#### SmartGridNotificationFailures (warning)
- **Expression**: `rate(notifications_failed_total[5m]) > 0` for 10 minutes
- **Threshold**: Any notification failure sustained for 10 minutes
- **Why 0**: Like billing, notification delivery should be 100% reliable. Missed low-balance or overdue-payment alerts can lead to unexpected service disconnections for electricity consumers. The alert-service uses Gmail SMTP (Secrets Manager credentials) — SMTP failures may indicate expired credentials or Gmail account issues.
- **Why 10 minutes (not 5m)**: A single SMTP transient error (network hiccup, Gmail rate limit) can cause 1-2 failures that resolve themselves. 10 minutes confirms the failure is sustained and requires human intervention.

---

## Grafana Dashboards

Three dashboards are auto-imported via ConfigMap sidecar (label `grafana_dashboard: "1"`):

### 1. Application Overview (`smartgrid-overview`)
- Total request rate (req/s)
- Overall error rate (%)
- P95 response time (s)
- Running pod count
- Auth login failures (5m)
- Bills generated (1h)
- Request rate per service (timeseries)
- Error rate per service (timeseries)
- Node.js memory per service (timeseries)
- AI assistant Bedrock latency P95 (timeseries)

### 2. Infrastructure Health (`smartgrid-infra`)
- Node CPU gauge (avg %)
- Node memory gauge (avg %)
- Pod restarts (15m)
- EKS node count
- CPU per node (timeseries)
- Memory per node (timeseries)
- Pod memory vs limit per container (timeseries)

### 3. API Performance (`smartgrid-api`)
- P50/P95/P99 latency per service (timeseries)
- 5xx errors per service (timeseries)
- 4xx client errors per service (timeseries)
- Top 10 routes by request count (table)
- Slowest 10 routes by P95 latency (table)
- Meter readings submitted/s (timeseries)
- Bills generated/min (timeseries)
- AI fallbacks to Nova Lite (timeseries)

---

## Alertmanager Email Configuration

Alerts are routed to `fitnessofficialasad@gmail.com` via Gmail SMTP.

SMTP credentials (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) are stored in AWS Secrets Manager under `smartgrid-production/config`. The bootstrap job pre-creates the `alertmanager-smtp` Kubernetes Secret from Secrets Manager before ArgoCD syncs the monitoring Application — no credentials are hardcoded in any manifest.

**Routing logic:**
- `severity: critical` → immediate delivery, resend every **1 hour** until resolved
- `severity: warning` → delivery, resend every **4 hours** until resolved
- Inhibition rule: if `SmartGridServiceDown` fires (critical), downstream warning alerts for that service are suppressed — they are symptoms, not independent incidents.

---

## Deployment

The kube-prometheus-stack is deployed as an ArgoCD Application (`argocd/application-monitoring.yaml`):

```bash
# Apply the ArgoCD Application manifest
kubectl apply -f argocd/application-monitoring.yaml

# Verify Prometheus is running
kubectl get pods -n monitoring

# Access Grafana (port-forward)
kubectl port-forward svc/kube-prometheus-stack-grafana 3000:80 -n monitoring

# Access Prometheus UI
kubectl port-forward svc/kube-prometheus-stack-prometheus 9090:9090 -n monitoring

# Verify ServiceMonitors are discovered
kubectl get servicemonitor -n production

# Verify PrometheusRules are loaded
kubectl get prometheusrule -n production

# Check alert state
kubectl port-forward svc/kube-prometheus-stack-alertmanager 9093:9093 -n monitoring
```

## Adding New Metrics

1. Add the counter/histogram to `shared/metrics/index.js` inside `createServiceCounters()` for the relevant service.
2. Instrument the code path in the service's route handler.
3. If the metric needs an alert, add a rule to `smartgrid-helm/helm/smartgrid/templates/prometheusrule.yaml`.
4. Add a panel to the relevant Grafana dashboard ConfigMap in `grafana-dashboard.yaml`.
5. Document the threshold justification in this file.
