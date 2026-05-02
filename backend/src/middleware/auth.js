const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'ptm@srj2024secret');
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  const isAdmin = req.user?.role === 'admin' ||
    (Array.isArray(req.user?.routes) && req.user.routes.includes('/admin'));
  if (!isAdmin)
    return res.status(403).json({ success: false, message: 'Admin access required' });
  next();
}

module.exports = { requireAuth, requireAdmin };
