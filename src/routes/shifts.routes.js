// File: src/routes/shifts.routes.js
const express = require("express");
const router = express.Router();
const shiftsController = require("../controllers/shifts.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get(
  "/templates",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.getShiftTemplates
);
router.post(
  "/templates",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.createShiftTemplate
);
router.patch(
  "/templates/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.updateShiftTemplate
);
router.get("/", requireAuth, shiftsController.getEmployeeShifts);
router.post(
  "/assign",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.assignShift
);
router.post(
  "/bulk-assign",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.bulkAssignShifts
);
router.patch(
  "/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.updateShift
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  shiftsController.deleteShift
);
router.get("/calendar", requireAuth, shiftsController.getShiftCalendar);

module.exports = router;
