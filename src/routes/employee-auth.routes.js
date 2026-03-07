// File: src/routes/employee-auth.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/employee-auth.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { authLimiter } = require("../middleware/rateLimiter");
const { requireEmployee } = require("../middleware/employeeAuth");

// ── Public ────────────────────────────────────────────────────────────────────
router.post("/login", authLimiter, c.login);

// ── Employee self-service ─────────────────────────────────────────────────────
router.get("/me", requireEmployee, c.getMe);
router.post("/change-password", requireEmployee, c.changePassword);

// ── HR management of portal access ───────────────────────────────────────────
const canManage = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "hr_manager",
];
router.post(
  "/set-password",
  requireAuth,
  requireRoles(...canManage),
  c.setPortalPassword
);
router.post(
  "/toggle-access",
  requireAuth,
  requireRoles(...canManage),
  c.togglePortalAccess
);

module.exports = router;
