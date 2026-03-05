const express = require("express");
const router = express.Router();
const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRoles } = require("../middleware");

// READ (admin + manager)
router.get(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.getEmployees
);

// DEPARTMENTS — must be before /:id
router.get(
  "/departments",
  requireAuth,
  requireRoles("admin", "manager"),
  employeesController.getDepartments
);

// EXPORTS — must be before /:id
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
router.post(
  "/",
  requireAuth,
  requireRoles("admin"),
  employeesController.createEmployee
);
router.put(
  "/:id",
  requireAuth,
  requireRoles("admin"),
  employeesController.updateEmployee
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles("admin"),
  employeesController.deleteEmployee
);
router.patch(
  "/:id/restore",
  requireAuth,
  requireRoles("admin"),
  employeesController.restoreEmployee
);
router.patch(
  "/:id/salary",
  requireAuth,
  requireRoles("admin"),
  employeesController.updateEmployeeSalary
);
router.get(
  "/:id/salary-history",
  requireAuth,
  requireRoles("admin"),
  employeesController.getSalaryHistory
);

module.exports = router;
