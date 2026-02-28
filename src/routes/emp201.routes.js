// File: src/routes/emp201.routes.js
const express = require("express");
const router = express.Router();
const emp201Controller = require("../controllers/emp201.controller");
const { requireAuth, requireRoles } = require("../middleware");

// ===== ADMIN / MANAGER ONLY =====
// All EMP201 functions require admin or manager role

// Generate EMP201 from payroll data
router.post(
  "/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.generateEMP201
);

// Get all declarations
router.get(
  "/declarations",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.getEMP201Declarations
);

// Get single declaration with line items
router.get(
  "/declarations/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.getEMP201ById
);

// Update declaration (ETI, notes)
router.patch(
  "/declarations/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.updateEMP201
);

// Submit to SARS (manual eFiling)
router.post(
  "/declarations/:id/submit",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.submitToSARS
);

// Mark as paid
router.post(
  "/declarations/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.markAsPaid
);

// Export CSV for SARS
router.get(
  "/declarations/:id/export",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.exportCSV
);

// Dashboard summary
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.getDashboardSummary
);

// Payment schedule
router.get(
  "/schedule",
  requireAuth,
  requireRoles("admin", "manager"),
  emp201Controller.getPaymentSchedule
);

module.exports = router;