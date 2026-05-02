const express = require('express');
const jwt     = require('jsonwebtoken');

const router = express.Router();

const USERS = () => [
  { username: 'production', password: process.env.PASS_PRODUCTION || 'prod@ptm',  role: 'production' },
  { username: 'dispatch',   password: process.env.PASS_DISPATCH   || 'disp@ptm',  role: 'dispatch'   },
  { username: 'reports',    password: process.env.PASS_REPORTS    || 'rep@ptm',   role: 'reports'    },
  { username: 'admin',      password: process.env.PASS_ADMIN      || 'admin@ptm', role: 'admin'      },
];

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password required' });

  const user = USERS().find(u => u.username === username && u.password === password);
  if (!user)
    return res.status(401).json({ success: false, message: 'Invalid username or password' });

  const token = jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET || 'ptm@srj2024secret',
    { expiresIn: '8h' }
  );
  res.json({ success: true, token, role: user.role, username: user.username });
});

module.exports = router;
