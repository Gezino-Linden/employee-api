// File: src/routes/reports.routes.js
const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reports.controller");
const { requireAuth, requireRoles } = require("../middleware");

// All roles that can access reports
const auth = [
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "accountant",
    "front_office_manager",
    "supervisor"
  ),
];

// Legacy
router.get("/summary", ...auth, reportsController.getSummary);
router.get("/by-department", ...auth, reportsController.getSalaryByDepartment);
router.get("/highest-paid", ...auth, reportsController.getHighestPaid);
router.get("/summary.csv", ...auth, reportsController.exportSummaryCsv);
router.get("/summary.xlsx", ...auth, reportsController.exportSummaryXlsx);
router.get(
  "/by-department.csv",
  ...auth,
  reportsController.exportByDepartmentCsv
);
router.get(
  "/by-department.xlsx",
  ...auth,
  reportsController.exportByDepartmentXlsx
);
router.get(
  "/highest-paid.csv",
  ...auth,
  reportsController.exportHighestPaidCsv
);
router.get(
  "/highest-paid.xlsx",
  ...auth,
  reportsController.exportHighestPaidXlsx
);

// Full HR Report
router.get("/preview", ...auth, reportsController.getPreview);
router.get("/export/excel", ...auth, reportsController.exportExcel);
router.get("/export/pdf", ...auth, reportsController.exportPDF);

// Analytics / Labour
router.get(
  "/department-labour-costing",
  ...auth,
  reportsController.getDepartmentLabourCosting
);
router.get(
  "/shift-type-analysis",
  ...auth,
  reportsController.getShiftTypeAnalysis
);
router.get(
  "/labour-cost-trends",
  ...auth,
  reportsController.getLabourCostTrends
);
router.get(
  "/overtime-analysis",
  ...auth,
  reportsController.getOvertimeAnalysis
);
router.get(
  "/export/department-labour-costing.csv",
  ...auth,
  reportsController.exportDepartmentLabourCostingCSV
);

// Employee reports
router.get(
  "/employees/export/excel",
  ...auth,
  reportsController.exportEmployeesExcel
);
router.get(
  "/employees/export/pdf",
  ...auth,
  reportsController.exportEmployeesPDF
);
router.get(
  "/employees/headcount/export/excel",
  ...auth,
  reportsController.exportHeadcountExcel
);
router.get(
  "/employees/headcount/export/pdf",
  ...auth,
  reportsController.exportHeadcountPDF
);

// Payroll reports
router.get(
  "/payroll/export/excel",
  ...auth,
  reportsController.exportPayrollSummaryExcel
);
router.get(
  "/payroll/export/pdf",
  ...auth,
  reportsController.exportPayrollSummaryPDF
);
router.get(
  "/payroll/detailed/export/excel",
  ...auth,
  reportsController.exportPayrollDetailedExcel
);
router.get(
  "/payroll/detailed/export/pdf",
  ...auth,
  reportsController.exportPayrollDetailedPDF
);
router.get(
  "/payroll/ytd/export/excel",
  ...auth,
  reportsController.exportPayrollYTDExcel
);
router.get(
  "/payroll/ytd/export/pdf",
  ...auth,
  reportsController.exportPayrollYTDPDF
);

// Attendance reports
router.get(
  "/attendance/export/excel",
  ...auth,
  reportsController.exportAttendanceMonthlyExcel
);
router.get(
  "/attendance/export/pdf",
  ...auth,
  reportsController.exportAttendanceMonthlyPDF
);
router.get(
  "/attendance/range/export/excel",
  ...auth,
  reportsController.exportAttendanceRangeExcel
);
router.get(
  "/attendance/range/export/pdf",
  ...auth,
  reportsController.exportAttendanceRangePDF
);
router.get(
  "/attendance/overtime/export/excel",
  ...auth,
  reportsController.exportOvertimeExcel
);
router.get(
  "/attendance/overtime/export/pdf",
  ...auth,
  reportsController.exportOvertimePDF
);

// Leave reports
router.get(
  "/leave/balances/export/excel",
  ...auth,
  reportsController.exportLeaveBalancesExcel
);
router.get(
  "/leave/balances/export/pdf",
  ...auth,
  reportsController.exportLeaveBalancesPDF
);
router.get(
  "/leave/taken/export/excel",
  ...auth,
  reportsController.exportLeaveTakenExcel
);
router.get(
  "/leave/taken/export/pdf",
  ...auth,
  reportsController.exportLeaveTakenPDF
);

// SARS reports
router.get(
  "/sars/emp201/export/excel",
  ...auth,
  reportsController.exportEMP201Excel
);
router.get(
  "/sars/emp201/export/pdf",
  ...auth,
  reportsController.exportEMP201PDF
);
router.get(
  "/sars/liability/export/excel",
  ...auth,
  reportsController.exportTaxLiabilityExcel
);
router.get(
  "/sars/liability/export/pdf",
  ...auth,
  reportsController.exportTaxLiabilityPDF
);

module.exports = router;
