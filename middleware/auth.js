const jwt = require('jsonwebtoken');
const config = require('../lib/config');

const JWT_SECRET = config.jwtSecret;

/**
 * Middleware: require authentication via Bearer token.
 * Attaches req.user = { id, name, email }
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, name: decoded.name, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware: optionally attach user if token is present (non-blocking).
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = { id: decoded.id, name: decoded.name, email: decoded.email };
    } catch (err) {
      // Token invalid — continue without user
    }
  }
  next();
}

/**
 * Generate a JWT token for a user
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { requireAuth, optionalAuth, generateToken };
