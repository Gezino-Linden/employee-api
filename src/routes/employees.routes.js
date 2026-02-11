const express = require("express");
const router = express.Router();

const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Employees permissions:
 * - admin: full CRUD + salary updates + restore + delete
 * - manager: read-only (list + view) + exports
 */

// READ (admin + manager)
router.get(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.getEmployees
);

// EXPORTS (admin + manager) ✅ MUST be before "/:id"
router.get(
  "/export.csv",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.exportEmployeesCsv
);

router.get(
  "/export.xlsx",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.exportEmployeesXlsx
);

router.get(
  "/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.getEmployeeById
);

// CREATE (admin only)
router.post(
  "/",
  requireAuth,
  requireRoles("admin"),
  employeesController.createEmployee
);

// UPDATE (admin only)
router.put(
  "/:id",
  requireAuth,
  requireRoles("admin"),
  employeesController.updateEmployee
);

// SOFT DELETE (admin only)
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin"),
  employeesController.deleteEmployee
);

// RESTORE (admin only)
router.patch(
  "/:id/restore",
  requireAuth,
  requireRoles("admin"),
  employeesController.restoreEmployee
);

// SALARY UPDATE + AUDIT LOG (admin only)
router.patch(
  "/:id/salary",
  requireAuth,
  requireRoles("admin"),
  employeesController.updateEmployeeSalary
);

module.exports = router;
