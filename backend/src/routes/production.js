const express = require('express');
const { body, query: qv } = require('express-validator');
const { query: db, getClient } = require('../db');
const { validate } = require('../middleware/validation');

const router = express.Router();

// ── Validation rules ──────────────────────────────────────────
const productionValidation = [
  body('date').isDate().withMessage('Valid date is required'),
  body('size').notEmpty().withMessage('Size is required'),
  body('thickness').notEmpty().withMessage('Thickness is required'),
  body('length').notEmpty().withMessage('Length is required'),
  body('shift').isIn(['Shift A', 'Shift B']).withMessage('Shift must be Shift A or Shift B'),
  body('mill_no').isIn(['Mill1', 'Mill2', 'Mill3', 'Mill4']).withMessage('Mill No must be Mill1–Mill4'),
  // Prime
  body('prime_tonnage').isFloat({ min: 0 }).withMessage('Prime tonnage must be >= 0'),
  body('prime_pieces').isInt({ min: 0 }).withMessage('Prime pieces must be >= 0'),
  // Joint
  body('joint_pipes').isInt({ min: 0 }).withMessage('Joint pipes must be >= 0'),
  body('joint_tonnage').isFloat({ min: 0 }).withMessage('Joint tonnage must be >= 0'),
  // CQ
  body('cq_pipes').isInt({ min: 0 }).withMessage('CQ pipes must be >= 0'),
  body('cq_tonnage').isFloat({ min: 0 }).withMessage('CQ tonnage must be >= 0'),
  // Open
  body('open_pipes').isInt({ min: 0 }).withMessage('Open pipes must be >= 0'),
  body('open_tonnage').isFloat({ min: 0 }).withMessage('Open tonnage must be >= 0'),
  // Scrap KG
  body('scrap_endcut_kg').isFloat({ min: 0 }).withMessage('Scrap endcut must be >= 0'),
  body('scrap_bitcut_kg').isFloat({ min: 0 }).withMessage('Scrap bitcut must be >= 0'),
  body('scrap_burning_kg').isFloat({ min: 0 }).withMessage('Scrap burning must be >= 0'),
  // Quality
  body('rejection_percent').isFloat({ min: 0, max: 100 }).withMessage('Rejection % must be 0–100'),
  // Optional fields
  body('weight_per_pipe').optional().isFloat({ min: 0 }),
  body('rack_id').optional(),
];

// ── GET /api/production/mill-summary ─────────────────────────
router.get('/mill-summary', async (req, res, next) => {
  try {
    const result = await db(
      `SELECT
         mill_no,
         size,
         thickness,
         SUM(total_pipes)   AS total_pipes,
         SUM(total_tonnage) AS total_tonnage,
         SUM(prime_pieces)  AS prime_pipes,
         SUM(prime_tonnage) AS prime_tonnage,
         SUM(random_pipes)  AS random_pipes,
         SUM(random_tonnage) AS random_tonnage
       FROM production_entries
       WHERE mill_no IS NOT NULL
       GROUP BY mill_no, size, thickness
       ORDER BY mill_no, size, thickness`,
      []
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/production ───────────────────────────────────────
router.get(
  '/',
  [
    qv('page').optional().isInt({ min: 1 }),
    qv('limit').optional().isInt({ min: 1, max: 200 }),
    qv('size').optional().isString(),
    qv('thickness').optional().isString(),
    qv('mill_no').optional().isString(),
    qv('shift').optional().isString(),
    qv('date_from').optional().isDate(),
    qv('date_to').optional().isDate(),
  ],
  async (req, res, next) => {
    const page  = parseInt(req.query.page  || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];
    let pi = 1;

    if (req.query.size) {
      conditions.push(`pe.size ILIKE $${pi++}`);
      params.push(`%${req.query.size}%`);
    }
    if (req.query.thickness) {
      conditions.push(`pe.thickness ILIKE $${pi++}`);
      params.push(`%${req.query.thickness}%`);
    }
    if (req.query.mill_no) {
      conditions.push(`pe.mill_no = $${pi++}`);
      params.push(req.query.mill_no);
    }
    if (req.query.shift) {
      conditions.push(`pe.shift = $${pi++}`);
      params.push(req.query.shift);
    }
    if (req.query.date_from) {
      conditions.push(`pe.date >= $${pi++}`);
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push(`pe.date <= $${pi++}`);
      params.push(req.query.date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const [dataResult, countResult] = await Promise.all([
        db(
          `SELECT pe.*, r.rack_name
           FROM production_entries pe
           LEFT JOIN racks r ON r.id = pe.rack_id
           ${where}
           ORDER BY pe.date DESC, pe.created_at DESC
           LIMIT $${pi} OFFSET $${pi + 1}`,
          [...params, limit, offset]
        ),
        db(
          `SELECT COUNT(*) FROM production_entries pe ${where}`,
          params
        ),
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

// ── POST /api/production ──────────────────────────────────────
router.post('/', productionValidation, validate, async (req, res, next) => {
  const {
    date, size, thickness, length, od,
    shift, mill_no,
    weight_per_pipe, stamp, raw_material_grade,
    // Prime
    prime_tonnage, prime_pieces,
    // Joint
    joint_pipes, joint_tonnage,
    // CQ
    cq_pipes, cq_tonnage,
    // Open
    open_pipes, open_tonnage,
    // Scrap KG
    scrap_endcut_kg, scrap_bitcut_kg, scrap_burning_kg,
    // Quality
    rejection_percent,
    // Optional
    rack_id,
  } = req.body;

  // ── Calculations ──────────────────────────────────────────
  const _primeTonnage   = parseFloat(prime_tonnage  || 0);
  const _primePieces    = parseInt(prime_pieces      || 0, 10);
  const _jointPipes     = parseInt(joint_pipes       || 0, 10);
  const _jointTonnage   = parseFloat(joint_tonnage   || 0);
  const _cqPipes        = parseInt(cq_pipes          || 0, 10);
  const _cqTonnage      = parseFloat(cq_tonnage      || 0);
  const _openPipes      = parseInt(open_pipes        || 0, 10);
  const _openTonnage    = parseFloat(open_tonnage    || 0);
  const _endcutKg       = parseFloat(scrap_endcut_kg  || 0);
  const _bitcutKg       = parseFloat(scrap_bitcut_kg  || 0);
  const _burningKg      = parseFloat(scrap_burning_kg || 0);

  const random_pipes    = _jointPipes   + _cqPipes   + _openPipes;
  const random_tonnage  = _jointTonnage + _cqTonnage + _openTonnage;
  const total_pipes     = _primePieces  + random_pipes;
  const total_tonnage   = _primeTonnage + random_tonnage;
  const total_scrap_kg  = _endcutKg     + _bitcutKg  + _burningKg;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO production_entries (
         date, size, thickness, length, od,
         shift, mill_no,
         weight_per_pipe, stamp, raw_material_grade,
         prime_tonnage, prime_pieces,
         joint_pipes, joint_tonnage,
         cq_pipes, cq_tonnage,
         open_pipes, open_tonnage,
         random_pipes, random_tonnage,
         total_pipes, total_tonnage,
         scrap_endcut_kg, scrap_bitcut_kg, scrap_burning_kg, total_scrap_kg,
         rejection_percent,
         rack_id
       ) VALUES (
         $1,$2,$3,$4,$5,
         $6,$7,
         $8,$9,$10,
         $11,$12,
         $13,$14,
         $15,$16,
         $17,$18,
         $19,$20,
         $21,$22,
         $23,$24,$25,$26,
         $27,
         $28
       ) RETURNING *`,
      [
        date, size, thickness, length, od || null,
        shift, mill_no,
        weight_per_pipe || null, stamp || null, raw_material_grade || null,
        _primeTonnage, _primePieces,
        _jointPipes, _jointTonnage,
        _cqPipes, _cqTonnage,
        _openPipes, _openTonnage,
        random_pipes, random_tonnage,
        total_pipes, total_tonnage,
        _endcutKg, _bitcutKg, _burningKg, total_scrap_kg,
        parseFloat(rejection_percent || 0),
        rack_id || null,
      ]
    );

    // Update rack_stock if rack provided
    if (rack_id) {
      await client.query(
        `INSERT INTO rack_stock (rack_id, size, thickness, prime_tonnage, prime_pieces, random_tonnage, random_pieces)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (rack_id, size, thickness)
         DO UPDATE SET
           prime_tonnage  = rack_stock.prime_tonnage  + EXCLUDED.prime_tonnage,
           prime_pieces   = rack_stock.prime_pieces   + EXCLUDED.prime_pieces,
           random_tonnage = rack_stock.random_tonnage + EXCLUDED.random_tonnage,
           random_pieces  = rack_stock.random_pieces  + EXCLUDED.random_pieces,
           updated_at     = NOW()`,
        [rack_id, size, thickness, _primeTonnage, _primePieces, random_tonnage, random_pipes]
      );
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

// ── PUT /api/production/:id ───────────────────────────────────
router.put('/:id', productionValidation, validate, async (req, res, next) => {
  const {
    date, size, thickness, length, od,
    shift, mill_no,
    weight_per_pipe, stamp, raw_material_grade,
    prime_tonnage, prime_pieces,
    joint_pipes, joint_tonnage,
    cq_pipes, cq_tonnage,
    open_pipes, open_tonnage,
    scrap_endcut_kg, scrap_bitcut_kg, scrap_burning_kg,
    rejection_percent,
    rack_id,
  } = req.body;

  const _primeTonnage  = parseFloat(prime_tonnage  || 0);
  const _primePieces   = parseInt(prime_pieces      || 0, 10);
  const _jointPipes    = parseInt(joint_pipes        || 0, 10);
  const _jointTonnage  = parseFloat(joint_tonnage   || 0);
  const _cqPipes       = parseInt(cq_pipes           || 0, 10);
  const _cqTonnage     = parseFloat(cq_tonnage      || 0);
  const _openPipes     = parseInt(open_pipes         || 0, 10);
  const _openTonnage   = parseFloat(open_tonnage    || 0);
  const _endcutKg      = parseFloat(scrap_endcut_kg  || 0);
  const _bitcutKg      = parseFloat(scrap_bitcut_kg  || 0);
  const _burningKg     = parseFloat(scrap_burning_kg || 0);

  const random_pipes   = _jointPipes   + _cqPipes   + _openPipes;
  const random_tonnage = _jointTonnage + _cqTonnage + _openTonnage;
  const total_pipes    = _primePieces  + random_pipes;
  const total_tonnage  = _primeTonnage + random_tonnage;
  const total_scrap_kg = _endcutKg     + _bitcutKg  + _burningKg;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Fetch old entry to reverse rack_stock
    const oldRes = await client.query(
      'SELECT * FROM production_entries WHERE id = $1',
      [req.params.id]
    );
    if (oldRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }
    const old = oldRes.rows[0];

    // Reverse old rack_stock contribution
    if (old.rack_id) {
      const oldRandom = parseFloat(old.random_tonnage || 0) ||
        (parseFloat(old.random_joint_tonnage || 0) + parseFloat(old.random_cq_tonnage || 0) + parseFloat(old.random_open_tonnage || 0));
      const oldRandomPieces = parseInt(old.random_pipes || 0, 10) ||
        (parseInt(old.random_joint_pieces || 0, 10) + parseInt(old.random_cq_pieces || 0, 10) + parseInt(old.random_open_pieces || 0, 10));
      await client.query(
        `UPDATE rack_stock SET
           prime_tonnage  = GREATEST(0, prime_tonnage  - $1),
           prime_pieces   = GREATEST(0, prime_pieces   - $2),
           random_tonnage = GREATEST(0, random_tonnage - $3),
           random_pieces  = GREATEST(0, random_pieces  - $4),
           updated_at     = NOW()
         WHERE rack_id = $5 AND size = $6 AND thickness = $7`,
        [old.prime_tonnage, old.prime_pieces, oldRandom, oldRandomPieces, old.rack_id, old.size, old.thickness]
      );
    }

    // Update the entry
    const updateResult = await client.query(
      `UPDATE production_entries SET
         date=$1, size=$2, thickness=$3, length=$4, od=$5,
         shift=$6, mill_no=$7,
         weight_per_pipe=$8, stamp=$9, raw_material_grade=$10,
         prime_tonnage=$11, prime_pieces=$12,
         joint_pipes=$13, joint_tonnage=$14,
         cq_pipes=$15, cq_tonnage=$16,
         open_pipes=$17, open_tonnage=$18,
         random_pipes=$19, random_tonnage=$20,
         total_pipes=$21, total_tonnage=$22,
         scrap_endcut_kg=$23, scrap_bitcut_kg=$24, scrap_burning_kg=$25, total_scrap_kg=$26,
         rejection_percent=$27,
         rack_id=$28
       WHERE id=$29
       RETURNING *`,
      [
        date, size, thickness, length, od || null,
        shift, mill_no,
        weight_per_pipe || null, stamp || null, raw_material_grade || null,
        _primeTonnage, _primePieces,
        _jointPipes, _jointTonnage,
        _cqPipes, _cqTonnage,
        _openPipes, _openTonnage,
        random_pipes, random_tonnage,
        total_pipes, total_tonnage,
        _endcutKg, _bitcutKg, _burningKg, total_scrap_kg,
        parseFloat(rejection_percent || 0),
        rack_id || null,
        req.params.id,
      ]
    );

    // Apply new rack_stock contribution
    const newRackId = rack_id || null;
    if (newRackId) {
      await client.query(
        `INSERT INTO rack_stock (rack_id, size, thickness, prime_tonnage, prime_pieces, random_tonnage, random_pieces)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (rack_id, size, thickness)
         DO UPDATE SET
           prime_tonnage  = rack_stock.prime_tonnage  + EXCLUDED.prime_tonnage,
           prime_pieces   = rack_stock.prime_pieces   + EXCLUDED.prime_pieces,
           random_tonnage = rack_stock.random_tonnage + EXCLUDED.random_tonnage,
           random_pieces  = rack_stock.random_pieces  + EXCLUDED.random_pieces,
           updated_at     = NOW()`,
        [newRackId, size, thickness, _primeTonnage, _primePieces, random_tonnage, random_pipes]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/production/import ───────────────────────────────
// Bulk-insert historical production entries without touching rack_stock.
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
      const rowNum = idx + 2; // row 1 = header in CSV

      // ── In-memory validation ─────────────────────────────
      const missing = [];
      if (!row.date)     missing.push('date');
      if (!row.size)     missing.push('size');
      if (!row.thickness) missing.push('thickness');
      if (!row.length)   missing.push('length');
      if (!row.shift)    missing.push('shift');
      if (!row.mill_no)  missing.push('mill_no');

      if (missing.length > 0) {
        results.error_count++;
        results.errors.push({ row: rowNum, message: `Missing required fields: ${missing.join(', ')}` });
        continue;
      }
      if (!['Shift A', 'Shift B'].includes(row.shift)) {
        results.error_count++;
        results.errors.push({ row: rowNum, message: 'shift must be Shift A or Shift B' });
        continue;
      }
      if (!['Mill1', 'Mill2', 'Mill3', 'Mill4'].includes(row.mill_no)) {
        results.error_count++;
        results.errors.push({ row: rowNum, message: 'mill_no must be Mill1, Mill2, Mill3, or Mill4' });
        continue;
      }

      const _primeTonnage  = parseFloat(row.prime_tonnage  || 0);
      const _primePieces   = parseInt(row.prime_pieces      || 0, 10);
      const _jointPipes    = parseInt(row.joint_pipes        || 0, 10);
      const _jointTonnage  = parseFloat(row.joint_tonnage   || 0);
      const _cqPipes       = parseInt(row.cq_pipes           || 0, 10);
      const _cqTonnage     = parseFloat(row.cq_tonnage      || 0);
      const _openPipes     = parseInt(row.open_pipes         || 0, 10);
      const _openTonnage   = parseFloat(row.open_tonnage    || 0);
      const _endcutKg      = parseFloat(row.scrap_endcut_kg  || 0);
      const _bitcutKg      = parseFloat(row.scrap_bitcut_kg  || 0);
      const _burningKg     = parseFloat(row.scrap_burning_kg || 0);

      const random_pipes   = _jointPipes   + _cqPipes   + _openPipes;
      const random_tonnage = _jointTonnage + _cqTonnage + _openTonnage;
      const total_pipes    = _primePieces  + random_pipes;
      const total_tonnage  = _primeTonnage + random_tonnage;
      const total_scrap_kg = _endcutKg     + _bitcutKg  + _burningKg;

      await client.query('SAVEPOINT row_save');
      try {
        await client.query(
          `INSERT INTO production_entries (
             date, size, thickness, length, od,
             shift, mill_no,
             weight_per_pipe, stamp, raw_material_grade,
             prime_tonnage, prime_pieces,
             joint_pipes, joint_tonnage,
             cq_pipes, cq_tonnage,
             open_pipes, open_tonnage,
             random_pipes, random_tonnage,
             total_pipes, total_tonnage,
             scrap_endcut_kg, scrap_bitcut_kg, scrap_burning_kg, total_scrap_kg,
             rejection_percent,
             rack_id
           ) VALUES (
             $1,$2,$3,$4,$5,
             $6,$7,
             $8,$9,$10,
             $11,$12,
             $13,$14,
             $15,$16,
             $17,$18,
             $19,$20,
             $21,$22,
             $23,$24,$25,$26,
             $27,
             $28
           )`,
          [
            row.date, row.size, row.thickness, row.length, row.od || null,
            row.shift, row.mill_no,
            row.weight_per_pipe ? parseFloat(row.weight_per_pipe) : null,
            row.stamp || null,
            row.raw_material_grade || null,
            _primeTonnage, _primePieces,
            _jointPipes, _jointTonnage,
            _cqPipes, _cqTonnage,
            _openPipes, _openTonnage,
            random_pipes, random_tonnage,
            total_pipes, total_tonnage,
            _endcutKg, _bitcutKg, _burningKg, total_scrap_kg,
            parseFloat(row.rejection_percent || 0),
            row.rack_id || null,
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

// ── DELETE /api/production/:id ────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const entryRes = await client.query(
      'SELECT * FROM production_entries WHERE id = $1',
      [req.params.id]
    );
    if (entryRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Entry not found' });
    }

    const e = entryRes.rows[0];

    if (e.rack_id) {
      const randomTonnage = parseFloat(e.random_tonnage || 0) ||
        (parseFloat(e.random_joint_tonnage || 0) + parseFloat(e.random_cq_tonnage || 0) + parseFloat(e.random_open_tonnage || 0));
      const randomPieces = parseInt(e.random_pipes || 0, 10) ||
        (parseInt(e.random_joint_pieces || 0, 10) + parseInt(e.random_cq_pieces || 0, 10) + parseInt(e.random_open_pieces || 0, 10));

      await client.query(
        `UPDATE rack_stock SET
           prime_tonnage  = GREATEST(0, prime_tonnage  - $1),
           prime_pieces   = GREATEST(0, prime_pieces   - $2),
           random_tonnage = GREATEST(0, random_tonnage - $3),
           random_pieces  = GREATEST(0, random_pieces  - $4),
           updated_at     = NOW()
         WHERE rack_id = $5 AND size = $6 AND thickness = $7`,
        [e.prime_tonnage, e.prime_pieces, randomTonnage, randomPieces, e.rack_id, e.size, e.thickness]
      );
    }

    await client.query('DELETE FROM production_entries WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, message: 'Production entry deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
