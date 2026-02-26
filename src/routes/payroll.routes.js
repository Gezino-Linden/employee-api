// File: src/routes/payroll.routes.js
const express = require("express");
const router = express.Router();
const payrollController = require("../controllers/payroll.controller");
const { requireAuth, requireRoles } = require("../middleware");
const PDFDocument = require("pdfkit");

/**
 * Payroll Management Routes
 * All routes require authentication
 * Most routes require admin/manager role
 */

// ===== PAYROLL SUMMARY =====
// Get summary statistics for a payroll period
// Query params: month (1-12), year (YYYY)
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.getPayrollSummary
);

// ===== PAYROLL RECORDS =====
// Get all payroll records for a period with pagination
// Query params: month, year, status (draft|processed|paid), page, per_page
router.get(
  "/records",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.getPayrollRecords
);

// Update a specific payroll record (recalculates totals automatically)
// Body: allowances, bonuses, overtime, medical_aid, other_deductions, notes
router.patch(
  "/records/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.updatePayrollRecord
);

// ===== PAYROLL PROCESSING =====
// Initialize payroll for a new period (creates draft records for all active employees)
// Body: month, year
router.post(
  "/initialize",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.initializePayrollPeriod
);

// Process payroll for selected employees (draft -> processed)
// Body: employee_ids[], month, year
router.post(
  "/process",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.processPayroll
);

// Mark a payroll record as paid (processed -> paid)
// Body: payment_method, payment_date, payment_reference
router.patch(
  "/records/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.markAsPaid
);

// ===== PAYSLIP GENERATION =====
// Generate and download payslip (employees can view their own, admins can view all)
router.get("/payslip/:id", requireAuth, payrollController.generatePayslip);

// ===== PAYROLL HISTORY =====
// Get payroll history across multiple periods with pagination
// Query params: employee_id (optional), limit, page, per_page
router.get("/history", requireAuth, payrollController.getPayrollHistory);

module.exports = router;
