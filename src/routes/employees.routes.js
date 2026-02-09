const express = require("express");
const {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employees.controller");

const { requireAuth, requireRole } = require("../middleware");

const router = express.Router();

// admin-only employees module
router.get("/", requireAuth, requireRole("admin"), getEmployees);
router.get("/:id", requireAuth, requireRole("admin"), getEmployeeById);
router.post("/", requireAuth, requireRole("admin"), createEmployee);
router.put("/:id", requireAuth, requireRole("admin"), updateEmployee);
router.delete("/:id", requireAuth, requireRole("admin"), deleteEmployee);

module.exports = router;
