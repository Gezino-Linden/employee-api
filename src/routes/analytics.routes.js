// File: src/routes/analytics.routes.js
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const { requireAuth, requireRoles } = require("../middleware");

// ===== ADMIN / MANAGER ONLY =====
// All analytics functions require admin or manager role

// Main dashboard overview - all KPIs
router.get(
  "/dashboard",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getDashboardOverview
);

// Payroll analytics
router.get(
  "/payroll",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getPayrollAnalytics
);

// Leave analytics
router.get(
  "/leave",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getLeaveAnalytics
);

// Attendance analytics
router.get(
  "/attendance",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getAttendanceAnalytics
);

// Compliance analytics
router.get(
  "/compliance",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getComplianceAnalytics
);

// HR insights
router.get(
  "/hr-insights",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getHRInsights
);

// Export reports
router.get(
  "/export",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.exportReport
);

module.exports = router;
