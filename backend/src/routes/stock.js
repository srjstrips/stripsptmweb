const express = require('express');
const { query: db } = require('../db');

const router = express.Router();

// ── Shared helper: current stock = production - dispatch ───────
const STOCK_QUERY = `
  SELECT
    COALESCE(p.size, d.size)                                              AS size,
    COALESCE(p.thickness, d.thickness)                                    AS thickness,
    ROUND(GREATEST(0, COALESCE(p.prime_tonnage,  0) - COALESCE(d.prime_tonnage,  0)), 3) AS prime_tonnage,
    GREATEST(0, COALESCE(p.prime_pieces,   0) - COALESCE(d.prime_pieces,   0))           AS prime_pieces,
    ROUND(GREATEST(0, COALESCE(p.random_tonnage, 0) - COALESCE(d.random_tonnage, 0)), 3) AS random_tonnage,
    GREATEST(0, COALESCE(p.random_pieces,  0) - COALESCE(d.random_pieces,  0))           AS random_pieces,
    ROUND(GREATEST(0,
      COALESCE(p.prime_tonnage, 0) + COALESCE(p.random_tonnage, 0)
      - COALESCE(d.prime_tonnage, 0) - COALESCE(d.random_tonnage, 0)
    ), 3) AS total_tonnage
  FROM (
    SELECT size, thickness,
      SUM(prime_tonnage)  AS prime_tonnage,
      SUM(prime_pieces)   AS prime_pieces,
      SUM(random_tonnage) AS random_tonnage,
      SUM(random_pipes)   AS random_pieces
    FROM production_entries
    GROUP BY size, thickness
  ) p
  FULL OUTER JOIN (
    SELECT size, thickness,
      SUM(prime_tonnage)  AS prime_tonnage,
      SUM(prime_pieces)   AS prime_pieces,
      SUM(random_tonnage) AS random_tonnage,
      SUM(random_pieces)  AS random_pieces
    FROM dispatch_entries
    GROUP BY size, thickness
  ) d ON p.size = d.size AND p.thickness = d.thickness
  ORDER BY COALESCE(p.size, d.size), COALESCE(p.thickness, d.thickness)
`;

// ── GET /api/stock ─────────────────────────────────────────────
// Current live stock = production - dispatch, grouped by size + thickness
router.get('/', async (req, res, next) => {
  const { size, thickness } = req.query;

  try {
    const result = await db(STOCK_QUERY, []);

    let rows = result.rows;
    if (size)      rows = rows.filter((r) => r.size.toLowerCase().includes(size.toLowerCase()));
    if (thickness) rows = rows.filter((r) => r.thickness.toLowerCase().includes(thickness.toLowerCase()));

    const totals = rows.reduce(
      (acc, r) => ({
        total_prime_tonnage:  acc.total_prime_tonnage  + parseFloat(r.prime_tonnage),
        total_prime_pieces:   acc.total_prime_pieces   + parseInt(r.prime_pieces,   10),
        total_random_tonnage: acc.total_random_tonnage + parseFloat(r.random_tonnage),
        total_random_pieces:  acc.total_random_pieces  + parseInt(r.random_pieces,  10),
        grand_total_tonnage:  acc.grand_total_tonnage  + parseFloat(r.total_tonnage),
        grand_total_pieces:   acc.grand_total_pieces   + parseInt(r.prime_pieces, 10) + parseInt(r.random_pieces, 10),
      }),
      { total_prime_tonnage: 0, total_prime_pieces: 0, total_random_tonnage: 0, total_random_pieces: 0, grand_total_tonnage: 0, grand_total_pieces: 0 }
    );

    res.json({ success: true, summary: rows, totals });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/report ──────────────────────────────────────
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
           SUM(prime_tonnage)   AS prime_tonnage,
           SUM(prime_pieces)    AS prime_pieces,
           SUM(random_tonnage)  AS random_tonnage,
           SUM(random_pipes)    AS random_pieces,
           ROUND(SUM(total_scrap_kg) / 1000, 3) AS scrap_tonnage,
           0                    AS slit_wastage
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
           ROUND(SUM(total_scrap_kg) / 1000, 3) AS total_scrap,
           0 AS total_slit_wastage
         FROM production_entries ${where}`,
        params
      ),
    ]);

    res.json({ success: true, production: prod.rows, dispatch: disp.rows, scrap: scrap.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/detail ──────────────────────────────────────
// Stock grouped by size × thickness × length × stamp (IS grade)
// Optional ?date=YYYY-MM-DD for historical "as of" view
router.get('/detail', async (req, res, next) => {
  const { date } = req.query;
  const prodWhere = date ? 'WHERE date <= $1' : '';
  const dispWhere = date ? 'WHERE date <= $1' : '';
  const params    = date ? [date] : [];

  try {
    const result = await db(
      `SELECT
         COALESCE(p.size, d.size)                                                             AS size,
         COALESCE(p.thickness, d.thickness)                                                   AS thickness,
         COALESCE(p.length, d.length)                                                         AS length,
         CASE WHEN COALESCE(p.stamp, d.stamp, '') = '' THEN NULL
              ELSE COALESCE(p.stamp, d.stamp) END                                             AS stamp,
         ROUND(GREATEST(0, COALESCE(p.prime_tonnage,  0) - COALESCE(d.prime_tonnage,  0)), 3) AS prime_tonnage,
         GREATEST(0, COALESCE(p.prime_pieces,  0) - COALESCE(d.prime_pieces,  0))             AS prime_pieces,
         ROUND(GREATEST(0, COALESCE(p.random_tonnage, 0) - COALESCE(d.random_tonnage, 0)), 3) AS random_tonnage,
         GREATEST(0, COALESCE(p.random_pieces, 0) - COALESCE(d.random_pieces, 0))             AS random_pieces,
         ROUND(GREATEST(0,
           COALESCE(p.prime_tonnage, 0) + COALESCE(p.random_tonnage, 0)
           - COALESCE(d.prime_tonnage, 0) - COALESCE(d.random_tonnage, 0)
         ), 3)                                                                                 AS total_tonnage
       FROM (
         SELECT size, thickness, length, COALESCE(stamp, '') AS stamp,
           SUM(prime_tonnage)  AS prime_tonnage,
           SUM(prime_pieces)   AS prime_pieces,
           SUM(random_tonnage) AS random_tonnage,
           SUM(random_pipes)   AS random_pieces
         FROM production_entries ${prodWhere}
         GROUP BY size, thickness, length, COALESCE(stamp, '')
       ) p
       FULL OUTER JOIN (
         SELECT size, thickness, length, COALESCE(stamp, '') AS stamp,
           SUM(prime_tonnage)  AS prime_tonnage,
           SUM(prime_pieces)   AS prime_pieces,
           SUM(random_tonnage) AS random_tonnage,
           SUM(random_pieces)  AS random_pieces
         FROM dispatch_entries ${dispWhere}
         GROUP BY size, thickness, length, COALESCE(stamp, '')
       ) d ON p.size = d.size AND p.thickness = d.thickness
          AND COALESCE(p.length, '') = COALESCE(d.length, '')
          AND p.stamp = d.stamp
       ORDER BY COALESCE(p.size, d.size), COALESCE(p.thickness, d.thickness)`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/prime-matrix?date=YYYY-MM-DD ───────────────
// Returns prime produced vs prime dispatched per size×thickness
// (all combos that appear in either production or dispatch up to date)
router.get('/prime-matrix', async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query param is required' });
  }

  try {
    const [prod, disp] = await Promise.all([
      db(
        `SELECT size, thickness,
           ROUND(COALESCE(SUM(prime_tonnage), 0), 3) AS prime_produced
         FROM production_entries
         WHERE date <= $1
         GROUP BY size, thickness`,
        [date]
      ),
      db(
        `SELECT size, thickness,
           ROUND(COALESCE(SUM(prime_tonnage), 0), 3) AS prime_dispatched
         FROM dispatch_entries
         WHERE date <= $1
         GROUP BY size, thickness`,
        [date]
      ),
    ]);

    // Build a unified list of all size×thickness combos from both tables
    const keys = new Map();
    for (const r of prod.rows)  keys.set(`${r.size}|${r.thickness}`, { size: r.size, thickness: r.thickness, prime_produced: parseFloat(r.prime_produced), prime_dispatched: 0 });
    for (const r of disp.rows) {
      const k = `${r.size}|${r.thickness}`;
      if (keys.has(k)) keys.get(k).prime_dispatched = parseFloat(r.prime_dispatched);
      else keys.set(k, { size: r.size, thickness: r.thickness, prime_produced: 0, prime_dispatched: parseFloat(r.prime_dispatched) });
    }

    res.json({ success: true, date, data: Array.from(keys.values()) });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/stock/as-of?date=YYYY-MM-DD ──────────────────────
router.get('/as-of', async (req, res, next) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, message: 'date query param is required' });
  }

  try {
    const result = await db(
      `SELECT
         COALESCE(p.size, d.size)           AS size,
         COALESCE(p.thickness, d.thickness) AS thickness,
         ROUND(COALESCE(p.total_prod, 0) - COALESCE(d.total_disp, 0), 3) AS total_tonnage
       FROM (
         SELECT size, thickness, SUM(prime_tonnage + random_tonnage) AS total_prod
         FROM production_entries WHERE date <= $1
         GROUP BY size, thickness
       ) p
       FULL OUTER JOIN (
         SELECT size, thickness, SUM(prime_tonnage + random_tonnage) AS total_disp
         FROM dispatch_entries WHERE date <= $1
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
