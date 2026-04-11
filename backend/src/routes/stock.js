const express = require('express');
const { query: db } = require('../db');

const router = express.Router();

// ── GET /api/stock ─────────────────────────────────────────────
// Returns per-rack stock breakdown + aggregate totals
router.get('/', async (req, res, next) => {
  const { size, thickness, rack_id } = req.query;

  const conditions = [];
  const params = [];
  let pi = 1;

  if (size) {
    conditions.push(`rs.size ILIKE $${pi++}`);
    params.push(`%${size}%`);
  }
  if (thickness) {
    conditions.push(`rs.thickness ILIKE $${pi++}`);
    params.push(`%${thickness}%`);
  }
  if (rack_id) {
    conditions.push(`rs.rack_id = $${pi++}`);
    params.push(rack_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Per-rack stock rows
    const stockResult = await db(
      `SELECT
         rs.id,
         rs.rack_id,
         r.rack_name,
         r.location,
         rs.size,
         rs.thickness,
         rs.prime_tonnage,
         rs.prime_pieces,
         rs.random_tonnage,
         rs.random_pieces,
         (rs.prime_tonnage + rs.random_tonnage) AS total_tonnage,
         (rs.prime_pieces  + rs.random_pieces)  AS total_pieces,
         rs.updated_at
       FROM rack_stock rs
       JOIN racks r ON r.id = rs.rack_id
       ${where}
       ORDER BY r.rack_name, rs.size, rs.thickness`,
      params
    );

    // Aggregate totals (same filters, no per-rack breakdown)
    const totalResult = await db(
      `SELECT
         COALESCE(SUM(rs.prime_tonnage),  0) AS total_prime_tonnage,
         COALESCE(SUM(rs.prime_pieces),   0) AS total_prime_pieces,
         COALESCE(SUM(rs.random_tonnage), 0) AS total_random_tonnage,
         COALESCE(SUM(rs.random_pieces),  0) AS total_random_pieces,
         COALESCE(SUM(rs.prime_tonnage + rs.random_tonnage), 0) AS grand_total_tonnage,
         COALESCE(SUM(rs.prime_pieces  + rs.random_pieces),  0) AS grand_total_pieces
       FROM rack_stock rs
       JOIN racks r ON r.id = rs.rack_id
       ${where}`,
      params
    );

    // Size-wise summary (ignoring rack filter for the summary)
    const summaryResult = await db(
      `SELECT
         rs.size,
         rs.thickness,
         COALESCE(SUM(rs.prime_tonnage),  0) AS prime_tonnage,
         COALESCE(SUM(rs.prime_pieces),   0) AS prime_pieces,
         COALESCE(SUM(rs.random_tonnage), 0) AS random_tonnage,
         COALESCE(SUM(rs.random_pieces),  0) AS random_pieces
       FROM rack_stock rs
       GROUP BY rs.size, rs.thickness
       ORDER BY rs.size, rs.thickness`
    );

    res.json({
      success: true,
      data: stockResult.rows,
      totals: totalResult.rows[0],
      summary: summaryResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/report ──────────────────────────────────────
// Production vs Dispatch comparison report
router.get('/report', async (req, res, next) => {
  const { date_from, date_to } = req.query;
  const conditions = [];
  const params = [];
  let pi = 1;

  if (date_from) { conditions.push(`date >= $${pi++}`); params.push(date_from); }
  if (date_to)   { conditions.push(`date <= $${pi++}`); params.push(date_to); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const [prod, disp, scrap] = await Promise.all([
      db(
        `SELECT
           size, thickness,
           SUM(prime_tonnage)         AS prime_tonnage,
           SUM(prime_pieces)          AS prime_pieces,
           SUM(random_joint_tonnage + random_cq_tonnage + random_open_tonnage) AS random_tonnage,
           SUM(random_joint_pieces  + random_cq_pieces  + random_open_pieces)  AS random_pieces,
           SUM(scrap_tonnage)         AS scrap_tonnage,
           SUM(slit_wastage)          AS slit_wastage
         FROM production_entries ${where}
         GROUP BY size, thickness ORDER BY size`,
        params
      ),
      db(
        `SELECT
           size, thickness,
           SUM(prime_tonnage)  AS prime_tonnage,
           SUM(prime_pieces)   AS prime_pieces,
           SUM(random_tonnage) AS random_tonnage,
           SUM(random_pieces)  AS random_pieces
         FROM dispatch_entries ${where}
         GROUP BY size, thickness ORDER BY size`,
        params
      ),
      db(
        `SELECT
           SUM(scrap_tonnage) AS total_scrap,
           SUM(slit_wastage)  AS total_slit_wastage
         FROM production_entries ${where}`,
        params
      ),
    ]);

    res.json({
      success: true,
      production: prod.rows,
      dispatch: disp.rows,
      scrap: scrap.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/as-of?date=YYYY-MM-DD ──────────────────────
// Stock position as of a given date = SUM(production) - SUM(dispatch) up to that date
router.get('/as-of', async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query param is required' });
  }

  try {
    const result = await db(
      `SELECT
         COALESCE(p.size, d.size)             AS size,
         COALESCE(p.thickness, d.thickness)   AS thickness,
         ROUND(
           COALESCE(p.total_prod, 0) - COALESCE(d.total_disp, 0),
           3
         )                                    AS total_tonnage
       FROM (
         SELECT size, thickness,
           SUM(prime_tonnage + random_tonnage) AS total_prod
         FROM production_entries
         WHERE date <= $1
         GROUP BY size, thickness
       ) p
       FULL OUTER JOIN (
         SELECT size, thickness,
           SUM(prime_tonnage + random_tonnage) AS total_disp
         FROM dispatch_entries
         WHERE date <= $1
         GROUP BY size, thickness
       ) d ON p.size = d.size AND p.thickness = d.thickness
       ORDER BY COALESCE(p.size, d.size), COALESCE(p.thickness, d.thickness)`,
      [date]
    );

    res.json({ success: true, date, data: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
