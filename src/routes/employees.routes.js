const express = require("express");
const router = express.Router();

const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRole } = require("../middleware");

//
// 🔵 READ ONLY (admin + manager)
//

// get all employees
router.get(
  "/",
  requireAuth,
  requireRole(["admin", "manager"]),
  employeesController.getEmployees
);

// get employee by id
router.get(
  "/:id",
  requireAuth,
  requireRole(["admin", "manager"]),
  employeesController.getEmployeeById
);

//
// 🔴 ADMIN ONLY (write actions)
//

// create employee
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  employeesController.createEmployee
);

// update employee
router.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  employeesController.updateEmployee
);

// delete (soft delete)
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  employeesController.deleteEmployee
);

// restore employee
router.patch(
  "/:id/restore",
  requireAuth,
  requireRole("admin"),
  employeesController.restoreEmployee
);

// salary update with audit log
router.patch(
  "/:id/salary",
  requireAuth,
  requireRole("admin"),
  employeesController.updateEmployeeSalary
);

module.exports = router;
