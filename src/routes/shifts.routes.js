// File: src/routes/shifts.routes.js
const express = require("express");
const router = express.Router();
const shiftsController = require("../controllers/shifts.controller");
const { requireAuth, requireRoles } = require("../middleware");

// ===== SHIFT TEMPLATES =====
// (Admin/Manager only)

// Get all shift templates
router.get(
  "/templates",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.getShiftTemplates
);

// Create shift template
router.post(
  "/templates",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.createShiftTemplate
);

// Update shift template
router.patch(
  "/templates/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.updateShiftTemplate
);

// ===== EMPLOYEE SHIFTS =====

// Get employee shifts (employees can view their own)
router.get("/", requireAuth, shiftsController.getEmployeeShifts);

// Assign shift to employee
router.post(
  "/assign",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.assignShift
);

// Bulk assign shifts
router.post(
  "/bulk-assign",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.bulkAssignShifts
);

// Update shift
router.patch(
  "/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.updateShift
);

// Delete shift
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.deleteShift
);

// Get shift calendar view
router.get("/calendar", requireAuth, shiftsController.getShiftCalendar);

module.exports = router;
