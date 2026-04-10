require('dotenv').config();
const express = require('express');
const cors = require('cors');

// ── Safety net: log but don't crash on unexpected errors ──────
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.message ?? reason);
});

const productionRoutes = require('./routes/production');
const dispatchRoutes   = require('./routes/dispatch');
const stockRoutes      = require('./routes/stock');
const racksRoutes      = require('./routes/racks');

const app = express();
const PORT = process.env.PORT || 5001;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/production', productionRoutes);
app.use('/api/dispatch',   dispatchRoutes);
app.use('/api/stock',      stockRoutes);
app.use('/api/racks',      racksRoutes);

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`PTM backend running on http://localhost:${PORT}`);
});
