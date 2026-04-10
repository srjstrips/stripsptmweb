const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3,
  min: 0,
  idleTimeoutMillis: 8000,
  connectionTimeoutMillis: 15000,
  keepAlive: false,
});

pool.on('error', (err) => {
  console.error('[pool] idle client error:', err.message);
});

pool.on('connect', () => {
  console.log('DB connected');
});

const isTransientError = (err) =>
  err.message && (
    err.message.includes('terminated unexpectedly') ||
    err.message.includes('Connection terminated') ||
    err.message.includes('ECONNRESET') ||
    err.message.includes('ECONNREFUSED') ||
    err.code === 'ECONNRESET'
  );

const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (isTransientError(err)) {
      console.warn('[db] transient error, retrying...', err.message);
      await new Promise((r) => setTimeout(r, 1000));
      return await pool.query(text, params);
    }
    throw err;
  }
};

const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
