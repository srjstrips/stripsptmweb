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

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // ── Check aggregate stock across all racks for this size+thickness ──
    const stockRes = await client.query(
      `SELECT
         COALESCE(SUM(prime_tonnage),  0) AS avail_prime_tonnage,
         COALESCE(SUM(prime_pieces),   0) AS avail_prime_pieces,
         COALESCE(SUM(random_tonnage), 0) AS avail_random_tonnage,
         COALESCE(SUM(random_pieces),  0) AS avail_random_pieces
       FROM rack_stock
       WHERE size = $1 AND thickness = $2`,
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
    if (rp > parseInt(stock.avail_random_pieces, 10)) {
      errors.push(`Insufficient random pieces. Available: ${stock.avail_random_pieces}, Requested: ${rp}`);
    }

    if (errors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(422).json({ success: false, message: 'Insufficient stock', errors });
    }

    // ── Insert dispatch entry ──────────────────────────────────
    const insertResult = await client.query(
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

    // ── Deduct from rack_stock (FIFO: iterate racks ordered by updated_at) ──
    if (pt > 0 || pp > 0 || rt > 0 || rp > 0) {
      const racksRes = await client.query(
        `SELECT * FROM rack_stock
         WHERE size = $1 AND thickness = $2
         ORDER BY updated_at ASC`,
        [size, thickness]
      );

      let remPrimeTonnage  = pt;
      let remPrimePieces   = pp;
      let remRandomTonnage = rt;
      let remRandomPieces  = rp;

      for (const rack of racksRes.rows) {
        if (remPrimeTonnage <= 0 && remPrimePieces <= 0 && remRandomTonnage <= 0 && remRandomPieces <= 0) break;

        const deductPT = Math.min(remPrimeTonnage,  parseFloat(rack.prime_tonnage));
        const deductPP = Math.min(remPrimePieces,   parseInt(rack.prime_pieces,   10));
        const deductRT = Math.min(remRandomTonnage, parseFloat(rack.random_tonnage));
        const deductRP = Math.min(remRandomPieces,  parseInt(rack.random_pieces,  10));

        await client.query(
          `UPDATE rack_stock SET
             prime_tonnage  = prime_tonnage  - $1,
             prime_pieces   = prime_pieces   - $2,
             random_tonnage = random_tonnage - $3,
             random_pieces  = random_pieces  - $4,
             updated_at     = NOW()
           WHERE id = $5`,
          [deductPT, deductPP, deductRT, deductRP, rack.id]
        );

        remPrimeTonnage  -= deductPT;
        remPrimePieces   -= deductPP;
        remRandomTonnage -= deductRT;
        remRandomPieces  -= deductRP;
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/dispatch/:id ──────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const entryRes = await client.query(
      'SELECT * FROM dispatch_entries WHERE id = $1',
      [req.params.id]
    );
    if (entryRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    const e = entryRes.rows[0];

    // Restore to a rack that has this size+thickness (first found)
    const rackRes = await client.query(
      'SELECT id FROM rack_stock WHERE size = $1 AND thickness = $2 LIMIT 1',
      [e.size, e.thickness]
    );

    if (rackRes.rows.length > 0) {
      await client.query(
        `UPDATE rack_stock SET
           prime_tonnage  = prime_tonnage  + $1,
           prime_pieces   = prime_pieces   + $2,
           random_tonnage = random_tonnage + $3,
           random_pieces  = random_pieces  + $4,
           updated_at     = NOW()
         WHERE id = $5`,
        [e.prime_tonnage, e.prime_pieces, e.random_tonnage, e.random_pieces, rackRes.rows[0].id]
      );
    }

    await client.query('DELETE FROM dispatch_entries WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Dispatch entry deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
