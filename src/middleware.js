const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

// ── Role hierarchy ────────────────────────────────────────────────────────
// owner              → full access including billing
// general_manager    → full operational access
// hr_manager         → employees, leave, payroll, reports
// accountant         → accounting, payroll view, SARS, EMP201
// front_office_manager → attendance, shifts, leave approval
// supervisor         → own department only: view staff, approve leave/shifts
// admin              → legacy alias for owner (backwards compat)
// manager            → legacy alias for general_manager (backwards compat)

const ROLE_HIERARCHY = {
  owner: 10,
  admin: 10, // legacy
  general_manager: 9,
  manager: 9, // legacy
  hr_manager: 7,
  accountant: 6,
  front_office_manager: 5,
  supervisor: 3,
};

// What each role can access
const ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: ["*"],
  general_manager: [
    "employees",
    "payroll",
    "leave",
    "attendance",
    "shifts",
    "reports",
    "analytics",
    "sars",
    "accounting",
  ],
  manager: [
    "employees",
    "payroll",
    "leave",
    "attendance",
    "shifts",
    "reports",
    "analytics",
    "sars",
    "accounting",
  ],
  hr_manager: ["employees", "leave", "payroll", "reports"],
  accountant: ["payroll", "accounting", "sars", "reports"],
  front_office_manager: ["attendance", "shifts", "leave"],
  supervisor: ["attendance", "shifts", "leave"],
};

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "missing token" });
  }
  const token = header.split(" ")[1].trim();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, role, company_id, department_id, iat, exp }
    return next();
  } catch (err) {
    return res.status(401).json({ error: "invalid token" });
  }
}

/**
 * requireRoles("owner", "hr_manager") — allows listed roles
 * Still supports legacy "admin" and "manager"
 */
function requireRoles(...roles) {
  const allowed = Array.isArray(roles[0]) ? roles[0] : roles;
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "not authenticated" });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Required role: ${allowed.join(" or ")}`,
        yourRole: req.user.role,
      });
    }
    return next();
  };
}

/**
 * requireMinRole("hr_manager") — allows that role and any higher role
 */
function requireMinRole(minRole) {
  const minLevel = ROLE_HIERARCHY[minRole] || 0;
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "not authenticated" });
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    if (userLevel < minLevel) {
      return res.status(403).json({
        error: `Access denied. Requires ${minRole} or higher.`,
        yourRole: req.user.role,
      });
    }
    return next();
  };
}

/**
 * requirePermission("payroll") — checks role permissions map
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "not authenticated" });
    const perms = ROLE_PERMISSIONS[req.user.role] || [];
    if (perms.includes("*") || perms.includes(permission)) return next();
    return res.status(403).json({
      error: `Your role (${req.user.role}) does not have access to ${permission}.`,
    });
  };
}

/**
 * requireDepartmentAccess — supervisors can only see their own department
 * Owners/GMs/HR see everything
 */
function requireDepartmentAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "not authenticated" });
  const level = ROLE_HIERARCHY[req.user.role] || 0;
  // roles with level >= 7 (hr_manager and above) see all departments
  if (level >= 7) return next();
  // supervisors and front_office_manager: scope to their department
  if (req.user.department) {
    req.departmentScope = req.user.department;
  }
  return next();
}

module.exports = {
  requireAuth,
  requireRoles,
  requireMinRole,
  requirePermission,
  requireDepartmentAccess,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
};
