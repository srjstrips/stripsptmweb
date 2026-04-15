const express = require('express');
const { body, query: qv } = require('express-validator');
const { query: db, getClient } = require('../db');
const { validate } = require('../middleware/validation');

const router = express.Router();

// ── Validation rules ──────────────────────────────────────────
const dispatchValidation = [
  body('date').isDate().withMessage('Valid date is required'),
  body('size').notEmpty().withMessage('Size is required'),
  body('thickness').notEmpty().withMessage('Thickness is required'),
  body('length').notEmpty().withMessage('Length is required'),
  body('prime_tonnage').isFloat({ min: 0 }).withMessage('Prime tonnage must be >= 0'),
  body('prime_pieces').isInt({ min: 0 }).withMessage('Prime pieces must be >= 0'),
  body('random_tonnage').isFloat({ min: 0 }).withMessage('Random tonnage must be >= 0'),
  body('random_pieces').isInt({ min: 0 }).withMessage('Random pieces must be >= 0'),
  body('party_name').optional({ nullable: true }).isString(),
  body('vehicle_no').optional({ nullable: true }).isString(),
  body('loading_slip_no').optional({ nullable: true }).isString(),
  body('order_tat').optional({ nullable: true }).isString(),
  body('weight_per_pipe').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }),
  body('pdi').optional({ nullable: true }).isString(),
  body('supervisor').optional({ nullable: true }).isString(),
  body('delivery_location').optional({ nullable: true }).isString(),
  body('remark').optional({ nullable: true }).isString(),
];

// ── GET /api/dispatch/totals ──────────────────────────────────
router.get('/totals', async (req, res, next) => {
  try {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const [allTime, thisMonth] = await Promise.all([
      db(
        `SELECT
           COALESCE(SUM(prime_tonnage + random_tonnage), 0) AS total_mt,
           COALESCE(SUM(prime_tonnage), 0)                 AS prime_mt,
           COALESCE(SUM(random_tonnage), 0)                AS random_mt
         FROM dispatch_entries`,
        []
      ),
      db(
        `SELECT
           COALESCE(SUM(prime_tonnage + random_tonnage), 0) AS total_mt,
           COALESCE(SUM(prime_tonnage), 0)                 AS prime_mt,
           COALESCE(SUM(random_tonnage), 0)                AS random_mt
         FROM dispatch_entries
         WHERE date >= $1 AND date <= $2`,
        [monthStart, todayStr]
      ),
    ]);

    res.json({
      success: true,
      all_time:   allTime.rows[0],
      this_month: thisMonth.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dispatch ─────────────────────────────────────────
router.get(
  '/',
  [
    qv('page').optional().isInt({ min: 1 }),
    qv('limit').optional().isInt({ min: 1, max: 200 }),
    qv('size').optional().isString(),
    qv('thickness').optional().isString(),
    qv('date_from').optional().isDate(),
    qv('date_to').optional().isDate(),
  ],
  async (req, res, next) => {
    const page  = parseInt(req.query.page  || '1',  10);
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let pi = 1;

    if (req.query.size) {
      conditions.push(`size ILIKE $${pi++}`);
      params.push(`%${req.query.size}%`);
    }
    if (req.query.thickness) {
      conditions.push(`thickness ILIKE $${pi++}`);
      params.push(`%${req.query.thickness}%`);
    }
    if (req.query.date_from) {
      conditions.push(`date >= $${pi++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`date <= $${pi++}`);
      params.push(req.query.date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const [dataResult, countResult] = await Promise.all([
        db(
          `SELECT * FROM dispatch_entries
           ${where}
           ORDER BY date DESC, created_at DESC
           LIMIT $${pi} OFFSET $${pi + 1}`,
          [...params, limit, offset]
        ),
        db(`SELECT COUNT(*) FROM dispatch_entries ${where}`, params),
      ]);

      res.json({
        success: true,
        data: dataResult.rows,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.rows[0].count, 10),
          pages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/dispatch ────────────────────────────────────────
router.post('/', dispatchValidation, validate, async (req, res, next) => {
  const {
    date, size, thickness, length,
    prime_tonnage, prime_pieces,
    random_tonnage, random_pieces,
    party_name, vehicle_no, loading_slip_no, order_tat,
    weight_per_pipe, pdi, supervisor, delivery_location, remark,
  } = req.body;

  const pt  = parseFloat(prime_tonnage  || 0);
  const pp  = parseInt(prime_pieces     || 0, 10);
  const rt  = parseFloat(random_tonnage || 0);
  const rp  = parseInt(random_pieces    || 0, 10);
  const wpp = weight_per_pipe ? parseFloat(weight_per_pipe) : null;

  try {
    // ── Check available stock (production - dispatch) ──────────
    const stockRes = await db(
      `SELECT
         GREATEST(0, COALESCE(p.prime_tonnage,  0) - COALESCE(d.prime_tonnage,  0)) AS avail_prime_tonnage,
         GREATEST(0, COALESCE(p.prime_pieces,   0) - COALESCE(d.prime_pieces,   0)) AS avail_prime_pieces,
         GREATEST(0, COALESCE(p.random_tonnage, 0) - COALESCE(d.random_tonnage, 0)) AS avail_random_tonnage,
         GREATEST(0, COALESCE(p.random_pieces,  0) - COALESCE(d.random_pieces,  0)) AS avail_random_pieces
       FROM (
         SELECT
           SUM(prime_tonnage)  AS prime_tonnage,
           SUM(prime_pieces)   AS prime_pieces,
           SUM(random_tonnage) AS random_tonnage,
           SUM(random_pipes)   AS random_pieces
         FROM production_entries WHERE size = $1 AND thickness = $2
       ) p
       FULL OUTER JOIN (
         SELECT
           SUM(prime_tonnage)  AS prime_tonnage,
           SUM(prime_pieces)   AS prime_pieces,
           SUM(random_tonnage) AS random_tonnage,
           SUM(random_pieces)  AS random_pieces
         FROM dispatch_entries WHERE size = $1 AND thickness = $2
       ) d ON true`,
      [size, thickness]
    );

    const stock = stockRes.rows[0];
    const errors = [];

    if (pt > parseFloat(stock.avail_prime_tonnage)) {
      errors.push(`Insufficient prime stock. Available: ${stock.avail_prime_tonnage} MT, Requested: ${pt} MT`);
    }
    if (pp > parseInt(stock.avail_prime_pieces, 10)) {
      errors.push(`Insufficient prime pieces. Available: ${stock.avail_prime_pieces}, Requested: ${pp}`);
    }
    if (rt > parseFloat(stock.avail_random_tonnage)) {
      errors.push(`Insufficient random stock. Available: ${stock.avail_random_tonnage} MT, Requested: ${rt} MT`);
    }

    if (errors.length > 0) {
      return res.status(422).json({ success: false, message: 'Insufficient stock', errors });
    }

    // ── Insert dispatch entry ──────────────────────────────────
    const insertResult = await db(
      `INSERT INTO dispatch_entries
        (date, size, thickness, length,
         prime_tonnage, prime_pieces, random_tonnage, random_pieces,
         party_name, vehicle_no, loading_slip_no, order_tat,
         weight_per_pipe, pdi, supervisor, delivery_location, remark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [date, size, thickness, length, pt, pp, rt, rp,
       party_name || null, vehicle_no || null, loading_slip_no || null, order_tat || null,
       wpp, pdi || null, supervisor || null, delivery_location || null, remark || null]
    );

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dispatch/import ─────────────────────────────────
// Bulk-insert historical dispatch entries without stock validation.
router.post('/import', async (req, res, next) => {
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No rows provided' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ success: false, message: 'Maximum 500 rows per import' });
  }

  const results = { success_count: 0, error_count: 0, errors: [] };
  const client = await getClient();

  try {
    await client.query('BEGIN');

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const rowNum = idx + 2;

      const missing = [];
      if (!row.date)      missing.push('date');
      if (!row.size)      missing.push('size');
      if (!row.thickness) missing.push('thickness');
      if (!row.length)    missing.push('length');

      if (missing.length > 0) {
        results.error_count++;
        results.errors.push({ row: rowNum, message: `Missing required fields: ${missing.join(', ')}` });
        continue;
      }

      const pt  = parseFloat(row.prime_tonnage  || 0);
      const pp  = parseInt(row.prime_pieces      || 0, 10);
      const rt  = parseFloat(row.random_tonnage || 0);
      const rp  = parseInt(row.random_pieces    || 0, 10);
      const wpp = row.weight_per_pipe ? parseFloat(row.weight_per_pipe) : null;

      await client.query('SAVEPOINT row_save');
      try {
        await client.query(
          `INSERT INTO dispatch_entries
            (date, size, thickness, length,
             prime_tonnage, prime_pieces, random_tonnage, random_pieces,
             party_name, vehicle_no, loading_slip_no, order_tat,
             weight_per_pipe, pdi, supervisor, delivery_location, remark)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            row.date, row.size, row.thickness, row.length,
            pt, pp, rt, rp,
            row.party_name || null, row.vehicle_no || null,
            row.loading_slip_no || null, row.order_tat || null,
            wpp, row.pdi || null, row.supervisor || null,
            row.delivery_location || null, row.remark || null,
          ]
        );
        await client.query('RELEASE SAVEPOINT row_save');
        results.success_count++;
      } catch (rowErr) {
        await client.query('ROLLBACK TO SAVEPOINT row_save');
        results.error_count++;
        results.errors.push({ row: rowNum, message: rowErr.message });
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, ...results });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/dispatch/:id ──────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db(
      'DELETE FROM dispatch_entries WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    res.json({ success: true, message: 'Dispatch entry deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/dispatch/all ──────────────────────────────────
router.delete('/all', async (req, res, next) => {
  try {
    const result = await db('DELETE FROM dispatch_entries RETURNING id', []);
    res.json({ success: true, deleted: result.rowCount, message: `${result.rowCount} dispatch entries deleted` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
