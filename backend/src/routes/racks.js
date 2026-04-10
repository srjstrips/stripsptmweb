const express = require('express');
const { body } = require('express-validator');
const { query: db } = require('../db');
const { validate } = require('../middleware/validation');

const router = express.Router();

// GET /api/racks — list all racks
router.get('/', async (req, res, next) => {
  try {
    const result = await db(
      `SELECT r.*,
              COALESCE(SUM(rs.prime_tonnage), 0)  AS total_prime_tonnage,
              COALESCE(SUM(rs.random_tonnage), 0) AS total_random_tonnage
       FROM racks r
       LEFT JOIN rack_stock rs ON rs.rack_id = r.id
       GROUP BY r.id
       ORDER BY r.rack_name`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/racks — create a rack
router.post(
  '/',
  [
    body('rack_name').notEmpty().withMessage('Rack name is required'),
    body('location').optional().isString(),
    body('capacity').optional().isFloat({ min: 0 }),
  ],
  validate,
  async (req, res, next) => {
    const { rack_name, location, capacity } = req.body;
    try {
      const result = await db(
        `INSERT INTO racks (rack_name, location, capacity)
         VALUES ($1, $2, $3) RETURNING *`,
        [rack_name, location || null, capacity || 0]
      );
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ success: false, message: 'Rack name already exists' });
      }
      next(err);
    }
  }
);

// DELETE /api/racks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await db('DELETE FROM racks WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Rack deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
