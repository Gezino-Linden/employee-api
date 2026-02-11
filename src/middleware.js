const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

/*
========================================
AUTH CHECK (token required)
========================================
*/
function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing token" });
  }

  const token = header.split(" ")[1].trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // payload contains: id, email, role
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

/*
========================================
SINGLE ROLE CHECK (admin only etc)
========================================
*/
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "not authenticated" });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: "forbidden" });
    }

    next();
  };
}

/*
========================================
MULTIPLE ROLES CHECK (enterprise ready)
Example:
requireRoles("admin","manager")
========================================
*/
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "forbidden" });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireRoles,
};
