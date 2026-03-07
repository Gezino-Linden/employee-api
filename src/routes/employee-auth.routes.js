// File: src/routes/employee-auth.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/employee-auth.controller");
const { requireAuth, requireRoles } = require("../middleware.js");
const { authLimiter } = require("../middleware/rateLimiter");
const { requireEmployee } = require("../middleware/employeeAuth");

// â”€â”€ Public â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post("/login", authLimiter, c.login);

// â”€â”€ Employee self-service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get("/me", requireEmployee, c.getMe);
router.post("/change-password", requireEmployee, c.changePassword);

// â”€â”€ HR management of portal access â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// redeploy

