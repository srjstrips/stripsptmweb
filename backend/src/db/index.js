const { Pool } = require('pg');
require('dotenv').config();

const isSupabase = (process.env.DATABASE_URL || '').includes('supabase.co');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSupabase ? { rejectUnauthorized: false } : false,

  // Small pool — Supabase free tier limits total connections
  max: 3,
  min: 0,                      // no idle connections kept alive (Supabase drops them anyway)
  idleTimeoutMillis: 8000,
  connectionTimeoutMillis: 15000,
  keepAlive: false,            // disable TCP keepalive — let Supabase manage it
});

// Pool-level error: fired for idle clients that lose their connection.
// Absorbed here so it never becomes an uncaught exception.
pool.on('error', (err) => {
  console.error('[pool] idle client error:', err.message);
});

// Per-client error handler: prevents "Unhandled error event" crash
// when a connection drops while a query is in flight.
pool.on('connect', (client) => {
  console.log('DB connected');
  client.on('error', (err) => {
    console.error('[client] connection error:', err.message);
  });
});

// Connection errors we should retry on
const isTransientError = (err) =>
  err.message && (
    err.message.includes('terminated unexpectedly') ||
    err.message.includes('Connection terminated') ||
    err.message.includes('ECONNRESET') ||
    err.message.includes('ECONNREFUSED') ||
    err.code === 'ECONNRESET'
  );

// Wrapped query with one automatic retry on transient connection errors
const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (isTransientError(err)) {
      console.warn('[db] transient connection error, retrying in 1 s…', err.message);
      await new Promise((r) => setTimeout(r, 1000));
      return await pool.query(text, params); // second attempt — let it throw if it fails again
    }
    throw err;
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
