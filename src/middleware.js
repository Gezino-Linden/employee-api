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
    req.user = payload; // { id, email, role, company_id, iat, exp }
    return next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

/**
 * requireRoles("admin") OR requireRoles("admin","manager") OR requireRoles(["admin","manager"])
 */
function requireRoles(...roles) {
  const allowed = Array.isArray(roles[0]) ? roles[0] : roles;

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "not authenticated" });

    if (!allowed.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: `forbidden: ${allowed.join(" or ")} only` });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRoles };
