// File: src/routes/employees.routes.js
const express = require("express");
const router = express.Router();
const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Roles that can READ employees
const canRead = ["owner", "admin", "general_manager", "manager", "hr_manager"];
// Roles that can WRITE employees
const canWrite = ["owner", "admin", "general_manager", "manager", "hr_manager"];

router.get(
  "/",
  requireAuth,
  requireRoles(...canRead),
  employeesController.getEmployees
);
router.get(
  "/departments",
  requireAuth,
  requireRoles(...canRead),
  employeesController.getDepartments
);
router.get(
  "/export.csv",
  requireAuth,
  requireRoles(...canRead),
  employeesController.exportEmployeesCsv
);
router.get(
  "/export.xlsx",
  requireAuth,
  requireRoles(...canRead),
  employeesController.exportEmployeesXlsx
);
router.get(
  "/:id",
  requireAuth,
  requireRoles(...canRead),
  employeesController.getEmployeeById
);
router.post(
  "/",
  requireAuth,
  requireRoles(...canWrite),
  employeesController.createEmployee
);
router.put(
  "/:id",
  requireAuth,
  requireRoles(...canWrite),
  employeesController.updateEmployee
);
router.delete(
  "/:id",
  requireAuth,
  requireRoles(...canWrite),
  employeesController.deleteEmployee
);
router.patch(
  "/:id/restore",
  requireAuth,
  requireRoles(...canWrite),
  employeesController.restoreEmployee
);
router.patch(
  "/:id/salary",
  requireAuth,
  requireRoles("owner", "admin", "general_manager", "manager", "hr_manager"),
  employeesController.updateEmployeeSalary
);
router.get(
  "/:id/salary-history",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "accountant"
  ),
  employeesController.getSalaryHistory
);

module.exports = router;
