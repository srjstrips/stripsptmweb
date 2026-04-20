const express = require('express');
const { pool } = require('../db');
const router  = express.Router();

// ── GET production sizes for a mill+date ────────────────────────────────────
router.get('/production-sizes', async (req, res) => {
  const { date, mill_no } = req.query;
  if (!date || !mill_no) return res.status(400).json({ message: 'date and mill_no required' });
  try {
    const { rows } = await pool.query(
      `SELECT
         size, thickness,
         SUM(prime_tonnage)   AS prime_mt,
         SUM(random_tonnage)  AS random_mt,
         SUM(total_pipes)     AS total_pieces,
         SUM(total_pipes * COALESCE(
           NULLIF(CAST(REGEXP_REPLACE(length, '[^0-9.]', '', 'g') AS NUMERIC), 0), 6
         ))                   AS total_meters
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

// ── POST: save/upsert a full mill-day entry (mill + sizes in one call) ───────
// Body: { date, mill_no, total_time, electrical_bd, mechanical_bd,
//         roll_change, production_bd, note, sizes: [...] }
router.post('/entry', async (req, res) => {
  const {
    date, mill_no,
    total_time    = 1440,
    electrical_bd = 0,
    mechanical_bd = 0,
    roll_change   = 0,
    production_bd = 0,
    note,
    sizes = [],
  } = req.body;

  if (!date || !mill_no) return res.status(400).json({ message: 'date and mill_no required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert mill-level entry
    const { rows: millRows } = await client.query(
      `INSERT INTO breakdown_mill
         (date, mill_no, total_time, electrical_bd, mechanical_bd, roll_change, production_bd, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (date, mill_no) DO UPDATE SET
         total_time    = EXCLUDED.total_time,
         electrical_bd = EXCLUDED.electrical_bd,
         mechanical_bd = EXCLUDED.mechanical_bd,
         roll_change   = EXCLUDED.roll_change,
         production_bd = EXCLUDED.production_bd,
         note          = EXCLUDED.note
       RETURNING *`,
      [date, mill_no, total_time, electrical_bd, mechanical_bd, roll_change, production_bd, note || null]
    );
    const millEntry = millRows[0];

    // Delete old size rows and re-insert (clean upsert)
    await client.query('DELETE FROM breakdown_size WHERE mill_entry_id = $1', [millEntry.id]);

    const savedSizes = [];
    for (const s of sizes) {
      if (!s.size || !s.thickness) continue;
      const { rows: sizeRows } = await client.query(
        `INSERT INTO breakdown_size
           (mill_entry_id, date, mill_no, size, thickness,
            time_on_size, prime_mt, random_mt, total_pieces, total_meters)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          millEntry.id, date, mill_no, s.size, s.thickness,
          s.time_on_size || 0,
          s.prime_mt     || 0,
          s.random_mt    || 0,
          s.total_pieces || 0,
          s.total_meters || 0,
        ]
      );
      savedSizes.push(sizeRows[0]);
    }

    await client.query('COMMIT');
    res.status(201).json({ mill: millEntry, sizes: savedSizes });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// ── GET: list mill entries with their sizes + computed speeds ────────────────
router.get('/entries', async (req, res) => {
  const { date_from, date_to, mill_no } = req.query;
  const params = []; const conds = [];
  if (date_from) { params.push(date_from); conds.push(`m.date >= $${params.length}`); }
  if (date_to)   { params.push(date_to);   conds.push(`m.date <= $${params.length}`); }
  if (mill_no)   { params.push(mill_no);   conds.push(`m.mill_no = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const { rows: mills } = await pool.query(
      `SELECT m.*,
         COALESCE(SUM(s.total_meters), 0) AS total_meters_all,
         COALESCE(SUM(s.time_on_size), 0)  AS time_used
       FROM breakdown_mill m
       LEFT JOIN breakdown_size s ON s.mill_entry_id = m.id
       ${where}
       GROUP BY m.id
       ORDER BY m.date DESC, m.mill_no`,
      params
    );

    // Fetch sizes for each mill entry
    const millIds = mills.map((m) => m.id);
    let sizeMap = {};
    if (millIds.length > 0) {
      const { rows: sizes } = await pool.query(
        `SELECT * FROM breakdown_size WHERE mill_entry_id = ANY($1) ORDER BY size, thickness`,
        [millIds]
      );
      for (const s of sizes) {
        if (!sizeMap[s.mill_entry_id]) sizeMap[s.mill_entry_id] = [];
        sizeMap[s.mill_entry_id].push(s);
      }
    }

    const result = mills.map((m) => ({
      ...m,
      sizes: sizeMap[m.id] || [],
    }));

    res.json({ data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch entries' });
  }
});

// ── DELETE mill entry (cascades to sizes) ────────────────────────────────────
router.delete('/entry/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM breakdown_mill WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ── GET: speed analysis — size-wise and mill-wise ───────────────────────────
router.get('/speed-analysis', async (req, res) => {
  const { date_from, date_to, mill_no } = req.query;
  const params = []; const conds = [];
  if (date_from) { params.push(date_from); conds.push(`s.date >= $${params.length}`); }
  if (date_to)   { params.push(date_to);   conds.push(`s.date <= $${params.length}`); }
  if (mill_no)   { params.push(mill_no);   conds.push(`s.mill_no = $${params.length}`); }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    // Size-wise speed: per size+thickness across all mills/dates
    const { rows: sizeWise } = await pool.query(
      `SELECT
         s.size, s.thickness,
         s.mill_no,
         s.date,
         s.time_on_size,
         s.total_meters,
         s.total_pieces,
         s.prime_mt,
         s.random_mt,
         CASE WHEN s.time_on_size > 0 THEN ROUND(s.total_meters / s.time_on_size, 3) ELSE 0 END AS speed_mpm
       FROM breakdown_size s
       ${where}
       ORDER BY s.date DESC, s.mill_no, s.size, s.thickness`,
      params
    );

    // Mill-wise speed: per mill per date
    const millParams = []; const millConds = [];
    if (date_from) { millParams.push(date_from); millConds.push(`m.date >= $${millParams.length}`); }
    if (date_to)   { millParams.push(date_to);   millConds.push(`m.date <= $${millParams.length}`); }
    if (mill_no)   { millParams.push(mill_no);   millConds.push(`m.mill_no = $${millParams.length}`); }
    const millWhere = millConds.length ? 'WHERE ' + millConds.join(' AND ') : '';

    const { rows: millWise } = await pool.query(
      `SELECT
         m.date, m.mill_no,
         m.total_time, m.electrical_bd, m.mechanical_bd, m.roll_change, m.production_bd,
         (m.electrical_bd + m.mechanical_bd + m.roll_change + m.production_bd) AS total_bd,
         (m.total_time - m.electrical_bd - m.mechanical_bd - m.roll_change - m.production_bd) AS available_time,
         COALESCE(SUM(s.total_meters), 0)  AS total_meters,
         COALESCE(SUM(s.total_pieces), 0)  AS total_pieces,
         COALESCE(SUM(s.prime_mt), 0)      AS prime_mt,
         COALESCE(SUM(s.random_mt), 0)     AS random_mt,
         COALESCE(SUM(s.time_on_size), 0)  AS time_used,
         CASE
           WHEN (m.total_time - m.electrical_bd - m.mechanical_bd - m.roll_change - m.production_bd) > 0
           THEN ROUND(COALESCE(SUM(s.total_meters),0) /
                (m.total_time - m.electrical_bd - m.mechanical_bd - m.roll_change - m.production_bd), 3)
           ELSE 0
         END AS mill_speed_mpm,
         CASE
           WHEN m.total_time > 0
           THEN ROUND((m.total_time - m.electrical_bd - m.mechanical_bd - m.roll_change - m.production_bd)
                * 100.0 / m.total_time, 1)
           ELSE 0
         END AS efficiency_pct
       FROM breakdown_mill m
       LEFT JOIN breakdown_size s ON s.mill_entry_id = m.id
       ${millWhere}
       GROUP BY m.id
       ORDER BY m.date DESC, m.mill_no`,
      millParams
    );

    res.json({ sizeWise, millWise });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch speed analysis' });
  }
});

// ── GET breakdown_reasons entries ────────────────────────────────────────────
router.get('/reasons', async (req, res) => {
  const { date_from, date_to, mill_no, size, department, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = []; const conds = [];
  if (date_from)  { params.push(date_from);  conds.push(`date >= $${params.length}`); }
  if (date_to)    { params.push(date_to);    conds.push(`date <= $${params.length}`); }
  if (mill_no)    { params.push(mill_no);    conds.push(`mill_no = $${params.length}`); }
  if (size)       { params.push(size);       conds.push(`size = $${params.length}`); }
  if (department) { params.push(department); conds.push(`department = $${params.length}`); }
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
    res.status(500).json({ message: 'Failed to fetch reasons' });
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
      const { date, mill_no, size, thickness, department, reason, time_taken = 0, times_repeated = 1 } = r;
      if (!date || !mill_no || !size || !thickness || !department || !reason) {
        errors.push({ row: r, message: 'date, mill_no, size, thickness, department, reason required' });
        continue;
      }
      try {
        const { rows: ins } = await client.query(
          `INSERT INTO breakdown_reasons
             (date, mill_no, size, thickness, department, reason, time_taken, times_repeated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
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
  } catch {
    res.status(500).json({ message: 'Delete failed' });
  }
});

// ── GET monthly analysis (reasons) ──────────────────────────────────────────
router.get('/analysis', async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ message: 'year and month required' });
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(parseInt(year), parseInt(month), 0).toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `SELECT
         size, thickness, department, reason,
         COUNT(*)                                       AS occurrence_count,
         SUM(times_repeated)                            AS total_repeats,
         SUM(time_taken)                                AS total_time_lost,
         ARRAY_AGG(DISTINCT mill_no ORDER BY mill_no)   AS mills_affected,
         COUNT(DISTINCT mill_no)                        AS mills_count,
         COUNT(DISTINCT date)                           AS days_occurred,
         MAX(time_taken)                                AS max_single_time
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
