const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRoles } = require("../middleware");

// admin + manager can view reports
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.getSummary
);

router.get(
  "/by-department",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.getSalaryByDepartment
);

router.get(
  "/highest-paid",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.getHighestPaid
);

module.exports = router;
