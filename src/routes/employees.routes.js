const express = require("express");
const router = express.Router();

const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Employees permissions:
 * - admin: full CRUD + salary updates + restore
 * - manager: read-only (list + view)
 */

// READ (admin + manager)
router.get(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.getEmployees
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

// SALARY UPDATE + AUDIT LOG (admin only)
router.patch(
  "/:id/salary",
  requireAuth,
  requireRoles("admin"),
  employeesController.updateEmployeeSalary
);

// RESTORE (admin only)
router.patch(
  "/:id/restore",
  requireAuth,
  requireRoles("admin"),
  employeesController.restoreEmployee
);

module.exports = router;
