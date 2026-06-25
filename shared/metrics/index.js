'use strict';
// Shared Prometheus metrics module for all SmartGrid services.
// Each service requires this file, registers its own service label,
// and mounts the /metrics route before the rate limiter.
//
// Usage in app.js:
//   const { metricsMiddleware, metricsHandler, createServiceCounters } = require('../../shared/metrics');
//   app.get('/metrics', metricsHandler);
//   app.use(metricsMiddleware);
//   const counters = createServiceCounters('auth-service');

const client = require('prom-client');

// One global registry per process — keeps all metrics in one scrape response.
const registry = new client.Registry();

// Add default Node.js runtime metrics: CPU seconds, memory bytes,
// garbage-collection duration, event-loop lag, open file descriptors, etc.
client.collectDefaultMetrics({ register: registry });

// ── HTTP Request Duration histogram ──────────────────────────────────────────
// Tracks the full time from request received to response sent.
// Buckets (seconds): 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
// Using these fine-grained buckets lets us compute P50/P95/P99 accurately.
const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['service', 'method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

// ── HTTP Requests counter ─────────────────────────────────────────────────────
// Total count of HTTP requests — useful for request rate (rate()[5m]) queries.
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['service', 'method', 'route', 'status_code'],
  registers: [registry],
});

// ── HTTP Error counter ────────────────────────────────────────────────────────
// Separate counter for 4xx/5xx errors so error-rate alerts are simple PromQL.
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx)',
  labelNames: ['service', 'method', 'route', 'status_code'],
  registers: [registry],
});

// ─────────────────────────────────────────────────────────────────────────────
// Express middleware — wraps every request with timing and counting.
// Skips /metrics itself to avoid self-referential noise.
// ─────────────────────────────────────────────────────────────────────────────
function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();

  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // Normalise dynamic route segments like /api/consumers/42 → /api/consumers/:id
    // so cardinality stays bounded.
    const route = normaliseRoute(req.path);
    const labels = {
      service: req.app.locals.serviceName || 'unknown',
      method:  req.method,
      route,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
    if (res.statusCode >= 400) {
      httpErrorsTotal.inc(labels);
    }
  });
  next();
}

// Replace numeric path segments with :id to cap label cardinality.
function normaliseRoute(path) {
  return path
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    || '/';
}

// ─────────────────────────────────────────────────────────────────────────────
// /metrics route handler — returns Prometheus text format.
// Register this BEFORE auth middleware and rate limiter.
// ─────────────────────────────────────────────────────────────────────────────
async function metricsHandler(req, res) {
  try {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service-specific business metrics factory.
// Call once per service — returns counters for domain events.
// ─────────────────────────────────────────────────────────────────────────────
function createServiceCounters(serviceName) {
  const shared = {
    // Track unhandled exceptions so we can alert on sudden spikes.
    exceptionsTotal: new client.Counter({
      name: `${toMetricName(serviceName)}_exceptions_total`,
      help: `Total unhandled exceptions in ${serviceName}`,
      labelNames: ['type'],
      registers: [registry],
    }),
  };

  // Per-service business counters
  const specific = {
    'auth-service': {
      loginAttemptsTotal: new client.Counter({
        name: 'auth_login_attempts_total',
        help: 'Total login attempts (success + failure)',
        registers: [registry],
      }),
      loginFailuresTotal: new client.Counter({
        name: 'auth_login_failures_total',
        help: 'Total failed login attempts — high rate may indicate brute-force attack',
        labelNames: ['reason'],
        registers: [registry],
      }),
      tokenValidationsTotal: new client.Counter({
        name: 'auth_token_validations_total',
        help: 'Total JWT token validations',
        labelNames: ['result'],
        registers: [registry],
      }),
    },
    'billing-service': {
      billsGeneratedTotal: new client.Counter({
        name: 'bills_generated_total',
        help: 'Total bills generated successfully by Lambda',
        registers: [registry],
      }),
      billGenerationFailuresTotal: new client.Counter({
        name: 'bill_generation_failures_total',
        help: 'Total bill generation failures (Lambda errors, S3 errors)',
        labelNames: ['reason'],
        registers: [registry],
      }),
      billGenerationDuration: new client.Histogram({
        name: 'bill_generation_duration_seconds',
        help: 'Time taken to generate a bill including Lambda invocation',
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
        registers: [registry],
      }),
    },
    'meter-service': {
      meterReadingsTotal: new client.Counter({
        name: 'meter_readings_submitted_total',
        help: 'Total meter readings submitted by consumers',
        labelNames: ['meter_type'],
        registers: [registry],
      }),
      meterReadingErrors: new client.Counter({
        name: 'meter_reading_errors_total',
        help: 'Total failed meter reading submissions',
        labelNames: ['reason'],
        registers: [registry],
      }),
    },
    'alert-service': {
      notificationsSentTotal: new client.Counter({
        name: 'notifications_sent_total',
        help: 'Total email notifications sent successfully',
        labelNames: ['type'],
        registers: [registry],
      }),
      notificationsFailedTotal: new client.Counter({
        name: 'notifications_failed_total',
        help: 'Total email notification failures (SMTP errors)',
        labelNames: ['type', 'reason'],
        registers: [registry],
      }),
    },
    'ai-assistant-service': {
      aiRequestsTotal: new client.Counter({
        name: 'ai_requests_total',
        help: 'Total AI assistant requests',
        labelNames: ['model'],
        registers: [registry],
      }),
      aiRequestDuration: new client.Histogram({
        name: 'ai_request_duration_seconds',
        help: 'Time taken for Bedrock model to respond',
        buckets: [1, 2, 5, 10, 20, 30, 50],
        registers: [registry],
      }),
      aiFallbackTotal: new client.Counter({
        name: 'ai_fallback_total',
        help: 'Times Nova Lite was used as fallback when Nova Pro was throttled',
        registers: [registry],
      }),
      textractRequestsTotal: new client.Counter({
        name: 'textract_requests_total',
        help: 'Total Textract PDF analysis requests',
        labelNames: ['result'],
        registers: [registry],
      }),
    },
    'consumer-service': {
      consumerLookupsTotal: new client.Counter({
        name: 'consumer_lookups_total',
        help: 'Total consumer profile lookups',
        labelNames: ['result'],
        registers: [registry],
      }),
    },
  };

  return { ...shared, ...(specific[serviceName] || {}) };
}

function toMetricName(serviceName) {
  return serviceName.replace(/-/g, '_');
}

module.exports = { registry, metricsMiddleware, metricsHandler, createServiceCounters };
