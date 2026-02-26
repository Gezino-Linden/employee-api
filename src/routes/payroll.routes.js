// File: src/routes/payroll.routes.js
const express = require("express");
const router = express.Router();
const payrollController = require("../controllers/payroll.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Payroll Management Routes
 * All routes require authentication
 * Most routes require admin/manager role
 */

// ===== PAYROLL SUMMARY =====
// Get summary statistics for a payroll period
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.getPayrollSummary
);

// ===== PAYROLL RECORDS =====
// Get all payroll records for a period
router.get(
  "/records",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.getPayrollRecords
);

// Update a specific payroll record
router.patch(
  "/records/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.updatePayrollRecord
);

// ===== PAYROLL PROCESSING =====
// Initialize payroll for a new period
router.post(
  "/initialize",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.initializePayrollPeriod
);

// Process payroll for selected employees
router.post(
  "/process",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.processPayroll
);

// Mark a payroll record as paid
router.patch(
  "/records/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  payrollController.markAsPaid
);

// ===== PAYSLIP GENERATION =====
// Generate and download payslip
router.get("/payslip/:id", requireAuth, payrollController.generatePayslip);

// ===== PAYROLL HISTORY =====
// Get payroll history (across multiple periods)
router.get("/history", requireAuth, payrollController.getPayrollHistory);

module.exports = router;
