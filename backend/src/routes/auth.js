const express = require('express');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { query } = require('../db');

const router = express.Router();

const ROLE_ROUTES = {
  production: ['/', '/production'],
  dispatch:   ['/', '/dispatch'],
  reports:    ['/', '/reports', '/stock'],
  admin:      ['/', '/production', '/dispatch', '/stock', '/reports', '/breakdown', '/admin'],
};

const ENV_USERS = () => [
  { username: 'production', password: process.env.PASS_PRODUCTION || 'prod@ptm',  role: 'production' },
  { username: 'dispatch',   password: process.env.PASS_DISPATCH   || 'disp@ptm',  role: 'dispatch'   },
  { username: 'reports',    password: process.env.PASS_REPORTS    || 'rep@ptm',   role: 'reports'    },
  { username: 'admin',      password: process.env.PASS_ADMIN      || 'admin@ptm', role: 'admin'      },
];

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password required' });

  const uname = username.toLowerCase().trim();

  // 1. Try DB users first
  try {
    const result = await query(
      'SELECT username, password_hash, role, allowed_routes FROM ptm_users WHERE username = $1',
      [uname]
    );
    if (result.rows.length > 0) {
      const dbUser = result.rows[0];
      const match  = await bcrypt.compare(password, dbUser.password_hash);
      if (!match)
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      const routes = dbUser.allowed_routes && dbUser.allowed_routes.length > 0
        ? dbUser.allowed_routes
        : (ROLE_ROUTES[dbUser.role] || ['/']);
      const token = jwt.sign(
        { username: dbUser.username, role: dbUser.role, routes },
        process.env.JWT_SECRET || 'ptm@srj2024secret',
        { expiresIn: '8h' }
      );
      return res.json({ success: true, token, role: dbUser.role, username: dbUser.username, routes });
    }
  } catch {
    // DB unavailable — fall through to env-var users
  }

  // 2. Fall back to env-var users
  const envUser = ENV_USERS().find(u => u.username === uname && u.password === password);
  if (!envUser)
    return res.status(401).json({ success: false, message: 'Invalid username or password' });

  const routes = ROLE_ROUTES[envUser.role] || ['/'];
  const token = jwt.sign(
    { username: envUser.username, role: envUser.role, routes },
    process.env.JWT_SECRET || 'ptm@srj2024secret',
    { expiresIn: '8h' }
  );
  res.json({ success: true, token, role: envUser.role, username: envUser.username, routes });
});

module.exports = router;
