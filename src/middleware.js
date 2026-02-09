const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization; // "Bearer <token>"

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing token" });
  }

  const token = header.split(" ")[1].trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "not authenticated" });
    if (req.user.role !== role)
      return res.status(403).json({ error: "forbidden: admin only" });
    next();
  };
}

module.exports = { requireAuth, requireRole };

exports.requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "forbidden: admin only" });
  }
  next();
};

