const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate() {
  const schemaPath = path.join(__dirname, '..', '..', '..', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('Running database migration...');
    await client.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
