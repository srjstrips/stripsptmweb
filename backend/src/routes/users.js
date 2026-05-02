const express  = require('express');
const bcrypt   = require('bcryptjs');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const VALID_ROLES = ['production', 'dispatch', 'reports', 'admin'];

// All user-management routes require admin JWT
router.use(requireAuth, requireAdmin);

// GET /api/users — list all users (no passwords)
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      'SELECT id, username, role, created_at FROM ptm_users ORDER BY created_at ASC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users — create user
router.post('/', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role)
    return res.status(400).json({ success: false, message: 'username, password and role are required' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ success: false, message: 'Invalid role' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO ptm_users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username.toLowerCase().trim(), hash, role]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ success: false, message: 'Username already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:id — update username / password / role
router.put('/:id', async (req, res) => {
  const { username, password, role } = req.body || {};
  if (role && !VALID_ROLES.includes(role))
    return res.status(400).json({ success: false, message: 'Invalid role' });
  try {
    // Build update dynamically
    const updates = [];
    const values  = [];
    let idx = 1;
    if (username) { updates.push(`username = $${idx++}`); values.push(username.toLowerCase().trim()); }
    if (role)     { updates.push(`role = $${idx++}`);     values.push(role); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push(`password_hash = $${idx++}`);
      values.push(hash);
    }
    if (updates.length === 0)
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    values.push(req.params.id);
    const result = await query(
      `UPDATE ptm_users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, role, created_at`,
      values
    );
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ success: false, message: 'Username already exists' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM ptm_users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
