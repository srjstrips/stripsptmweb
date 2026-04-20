const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// ── GET production sizes for a mill+date (auto-fill helper) ──────────────────
router.get('/production-sizes', async (req, res) => {
  const { date, mill_no } = req.query;
  if (!date || !mill_no) return res.status(400).json({ message: 'date and mill_no required' });
  try {
    const { rows } = await pool.query(
      `SELECT
         size, thickness,
         SUM(prime_tonnage)  AS prime_mt,
         SUM(random_tonnage) AS random_mt,
         SUM(total_pipes)    AS total_pieces,
         SUM(total_pipes * COALESCE(
           NULLIF(CAST(REPLACE(REPLACE(length,'m',''),'M','') AS NUMERIC), 0), 6
         )) AS total_meters
       FROM production_entries
       WHERE date = $1 AND mill_no = $2
       GROUP BY size, thickness
       ORDER BY size, thickness`,
      [date, mill_no]
    );
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch production sizes' });
  }
});

// ── GET breakdown_time entries ───────────────────────────────────────────────
router.get('/time', async (req, res) => {
  const { date_from, date_to, mill_no, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conds  = [];
  if (date_from) { params.push(date_from); conds.push(`date >= $${params.length}`); }
  if (date_to)   { params.push(date_to);   conds.push(`date <= $${params.length}`); }
  if (mill_no)   { params.push(mill_no);   conds.push(`mill_no = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM breakdown_time ${where}`, params
    );
    const total = parseInt(countRows[0].count);
    params.push(parseInt(limit)); params.push(offset);
    const { rows } = await pool.query(
      `SELECT * FROM breakdown_time ${where}
       ORDER BY date DESC, mill_no, size, thickness
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch breakdown time entries' });
  }
});

// ── POST breakdown_time (batch) ──────────────────────────────────────────────
router.post('/time', async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const client = await pool.connect();
  const saved = []; const errors = [];
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const { date, mill_no, size, thickness, total_time = 1440,
              electrical_bd = 0, mechanical_bd = 0, roll_change = 0, production_bd = 0,
              prime_mt = 0, random_mt = 0, total_pieces = 0, total_meters = 0, note } = r;
      if (!date || !mill_no || !size || !thickness) {
        errors.push({ row: r, message: 'date, mill_no, size, thickness required' });
        continue;
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO breakdown_time
             (date, mill_no, size, thickness, total_time,
              electrical_bd, mechanical_bd, roll_change, production_bd,
              prime_mt, random_mt, total_pieces, total_meters, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (date, mill_no, size, thickness)
           DO UPDATE SET
             total_time    = EXCLUDED.total_time,
             electrical_bd = EXCLUDED.electrical_bd,
             mechanical_bd = EXCLUDED.mechanical_bd,
             roll_change   = EXCLUDED.roll_change,
             production_bd = EXCLUDED.production_bd,
             prime_mt      = EXCLUDED.prime_mt,
             random_mt     = EXCLUDED.random_mt,
             total_pieces  = EXCLUDED.total_pieces,
             total_meters  = EXCLUDED.total_meters,
             note          = EXCLUDED.note
           RETURNING *`,
          [date, mill_no, size, thickness, total_time,
           electrical_bd, mechanical_bd, roll_change, production_bd,
           prime_mt, random_mt, total_pieces, total_meters, note]
        );
        saved.push(ins[0]);
      } catch (rowErr) {
        errors.push({ row: r, message: rowErr.message });
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ saved, errors, count: saved.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Batch save failed' });
  } finally {
    client.release();
  }
});

// ── DELETE breakdown_time/:id ────────────────────────────────────────────────
router.delete('/time/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM breakdown_time WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ── GET breakdown_reasons entries ────────────────────────────────────────────
router.get('/reasons', async (req, res) => {
  const { date_from, date_to, mill_no, size, thickness, department, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = []; const conds = [];
  if (date_from)   { params.push(date_from);   conds.push(`date >= $${params.length}`); }
  if (date_to)     { params.push(date_to);     conds.push(`date <= $${params.length}`); }
  if (mill_no)     { params.push(mill_no);     conds.push(`mill_no = $${params.length}`); }
  if (size)        { params.push(size);        conds.push(`size = $${params.length}`); }
  if (thickness)   { params.push(thickness);   conds.push(`thickness = $${params.length}`); }
  if (department)  { params.push(department);  conds.push(`department = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  try {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM breakdown_reasons ${where}`, params
    );
    const total = parseInt(countRows[0].count);
    params.push(parseInt(limit)); params.push(offset);
    const { rows } = await pool.query(
      `SELECT * FROM breakdown_reasons ${where}
       ORDER BY date DESC, mill_no, size, thickness, department
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch breakdown reasons' });
  }
});

// ── POST breakdown_reasons (batch) ───────────────────────────────────────────
router.post('/reasons', async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : [req.body];
  const client = await pool.connect();
  const saved = []; const errors = [];
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      const { date, mill_no, size, thickness, department, reason,
              time_taken = 0, times_repeated = 1 } = r;
      if (!date || !mill_no || !size || !thickness || !department || !reason) {
        errors.push({ row: r, message: 'date, mill_no, size, thickness, department, reason required' });
        continue;
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO breakdown_reasons
             (date, mill_no, size, thickness, department, reason, time_taken, times_repeated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [date, mill_no, size, thickness, department, reason, time_taken, times_repeated]
        );
        saved.push(ins[0]);
      } catch (rowErr) {
        errors.push({ row: r, message: rowErr.message });
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ saved, errors, count: saved.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: 'Batch save failed' });
  } finally {
    client.release();
  }
});

// ── DELETE breakdown_reasons/:id ─────────────────────────────────────────────
router.delete('/reasons/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM breakdown_reasons WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ── GET monthly analysis ─────────────────────────────────────────────────────
// Groups breakdown reasons by size+thickness+department+reason for a month
// Shows repeat count, total time lost, mills affected
router.get('/analysis', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ message: 'year and month required' });
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `SELECT
         size, thickness, department, reason,
         COUNT(*)                              AS occurrence_count,
         SUM(times_repeated)                   AS total_repeats,
         SUM(time_taken)                       AS total_time_lost,
         ARRAY_AGG(DISTINCT mill_no ORDER BY mill_no) AS mills_affected,
         COUNT(DISTINCT mill_no)               AS mills_count,
         COUNT(DISTINCT date)                  AS days_occurred,
         MAX(time_taken)                       AS max_single_time
       FROM breakdown_reasons
       WHERE date BETWEEN $1 AND $2
       GROUP BY size, thickness, department, reason
       ORDER BY total_time_lost DESC, occurrence_count DESC`,
      [startDate, endDate]
    );
    res.json({ data: rows, period: { year, month, startDate, endDate } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to generate analysis' });
  }
});

module.exports = router;
