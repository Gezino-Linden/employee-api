// File: src/routes/shifts.routes.js
const express = require("express");
const router = express.Router();
const shiftsController = require("../controllers/shifts.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Roles that can manage shifts
const canManage = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "hr_manager",
  "front_office_manager",
  "supervisor",
];

router.get(
  "/templates",
  requireAuth,
  requireRoles(...canManage),
  shiftsController.getShiftTemplates
);
router.post(
  "/templates",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.createShiftTemplate
);
router.patch(
  "/templates/:id",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.updateShiftTemplate
);
router.get("/", requireAuth, shiftsController.getEmployeeShifts);
router.post(
  "/assign",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.assignShift
);
router.post(
  "/bulk-assign",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.bulkAssignShifts
);
router.patch(
  "/:id",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.updateShift
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  shiftsController.deleteShift
);
router.get("/calendar", requireAuth, shiftsController.getShiftCalendar);

module.exports = router;
