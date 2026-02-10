const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRole } = require("../middleware");

// admin & managers only (for now admin)
router.get(
  "/summary",
  requireAuth,
  requireRole("admin"),
  reportsController.getSummary
);
router.get(
  "/by-department",
  requireAuth,
  requireRole("admin"),
  reportsController.getSalaryByDepartment
);
router.get(
  "/highest-paid",
  requireAuth,
  requireRole("admin"),
  reportsController.getHighestPaid
);

module.exports = router;
