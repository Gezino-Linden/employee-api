const express = require("express");
const router = express.Router();

const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRoles } = require("../middleware");

// VIEW REPORTS (admin + manager)
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

//
// 🔽 NEW EXPORT ROUTES
//

router.get(
  "/summary.csv",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportSummaryCsv
);

router.get(
  "/summary.xlsx",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportSummaryXlsx
);

router.get(
  "/by-department.csv",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportByDepartmentCsv
);

router.get(
  "/by-department.xlsx",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportByDepartmentXlsx
);

router.get(
  "/highest-paid.csv",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportHighestPaidCsv
);

router.get(
  "/highest-paid.xlsx",
  requireAuth,
  requireRoles("admin", "manager"),
  reportsController.exportHighestPaidXlsx
);

module.exports = router;
