// File: src/routes/analytics.routes.js
const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get(
  "/dashboard",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getDashboardOverview
);
router.get(
  "/payroll",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getPayrollAnalytics
);
router.get(
  "/leave",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getLeaveAnalytics
);
router.get(
  "/attendance",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getAttendanceAnalytics
);
router.get(
  "/compliance",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getComplianceAnalytics
);
router.get(
  "/hr-insights",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.getHRInsights
);
router.get(
  "/export",
  requireAuth,
  requireRoles("admin", "manager"),
  analyticsController.exportReport
);

module.exports = router;
