const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRole } = require("../middleware");

// GET /reports/summary
router.get(
  "/summary",
  requireAuth,
  requireRole("admin"),
  reportsController.getSummary
);

// GET /reports/by-department
router.get(
  "/by-department",
  requireAuth,
  requireRole("admin"),
  reportsController.getSalaryByDepartment
);

// GET /reports/highest-paid
router.get(
  "/highest-paid",
  requireAuth,
  requireRole("admin"),
  reportsController.getHighestPaid
);

module.exports = router;
