const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { requireFeature } = require("../middleware/license");

router.get("/dashboard", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getDashboardOverview);
router.get("/payroll", requireAuth, requireRoles("admin", "manager"), requireFeature("labour_dashboards"), analyticsController.getPayrollAnalytics);
router.get("/leave", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getLeaveAnalytics);
router.get("/attendance", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getAttendanceAnalytics);
router.get("/compliance", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getComplianceAnalytics);
router.get("/hr-insights", requireAuth, requireRoles("admin", "manager"), requireFeature("labour_dashboards"), analyticsController.getHRInsights);
router.get("/export", requireAuth, requireRoles("admin", "manager"), requireFeature("advanced_reporting"), analyticsController.exportReport);

router.get("/revenue", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getRevenueAnalytics);

router.get("/tips", requireAuth, requireRoles("admin", "manager"), requireFeature("department_analytics"), analyticsController.getTipsAnalytics);
module.exports = router;


