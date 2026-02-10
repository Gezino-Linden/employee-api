const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRole } = require("../middleware");

// ✅ allow ADMIN + MANAGER to view reports
router.get(
  "/summary",
  requireAuth,
  requireRole(["admin", "manager"]),
  reportsController.getSummary
);

router.get(
  "/by-department",
  requireAuth,
  requireRole(["admin", "manager"]),
  reportsController.getSalaryByDepartment
);

router.get(
  "/highest-paid",
  requireAuth,
  requireRole(["admin", "manager"]),
  reportsController.getHighestPaid
);

module.exports = router;
