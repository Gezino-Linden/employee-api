const express = require("express");
const router = express.Router();

const employeesController = require("../controllers/employees.controller");
const { requireAuth, requireRole } = require("../middleware");

// admin-only employees module
router.get(
  "/",
  requireAuth,
  requireRole("admin"),
  employeesController.getEmployees
);
router.get(
  "/:id",
  requireAuth,
  requireRole("admin"),
  employeesController.getEmployeeById
);
router.post(
  "/",
  requireAuth,
  requireRole("admin"),
  employeesController.createEmployee
);
router.put(
  "/:id",
  requireAuth,
  requireRole("admin"),
  employeesController.updateEmployee
);
router.delete(
  "/:id",
  requireAuth,
  requireRole("admin"),
  employeesController.deleteEmployee
);

// 🔥 salary update with audit log (admin only)
router.patch(
  "/:id/salary",
  requireAuth,
  requireRole("admin"),
  employeesController.updateEmployeeSalary
);

router.patch(
  "/:id/restore",
  requireAuth,
  requireRole("admin"),
  employeesController.restoreEmployee
);


module.exports = router;
