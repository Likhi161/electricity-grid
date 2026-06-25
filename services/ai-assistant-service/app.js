const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const assistantRoutes = require('./routes/assistant');
const { metricsMiddleware, metricsHandler, createServiceCounters } = require('../../shared/metrics');

const app = express();
app.locals.serviceName = 'ai-assistant-service';

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

// Health & Metrics — before any auth or rate limiting
app.get('/health',  (req, res) => res.status(200).json({ status: 'healthy', service: 'ai-assistant-service', timestamp: new Date() }));
app.get('/healthz', (req, res) => res.status(200).json({ status: 'healthy', service: 'ai-assistant-service', timestamp: new Date() }));
app.get('/ready',   (req, res) => res.status(200).json({ status: 'ready',   service: 'ai-assistant-service', timestamp: new Date() }));
app.get('/metrics', metricsHandler);
app.use(metricsMiddleware);
const metrics = createServiceCounters('ai-assistant-service');

app.use('/api/assistant', assistantRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Route Error:', err);
  res.status(500).json({ error: 'An unexpected error occurred' });
});

module.exports = app;
