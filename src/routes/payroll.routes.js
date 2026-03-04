const express = require("express");
const router = express.Router();
const c = require("../controllers/payroll.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, payrollValidators } = require("../middleware/validate");

router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getPayrollSummary
);
router.get(
  "/records",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getPayrollRecords
);
router.get("/history", requireAuth, c.getPayrollHistory);
router.get("/payslip/:id", requireAuth, c.generatePayslip);

router.post(
  "/initialize",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.initialize),
  c.initializePayrollPeriod
);

router.post(
  "/process",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.process),
  c.processPayroll
);

router.patch(
  "/records/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.update),
  c.updatePayrollRecord
);

router.patch(
  "/records/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.markPaid),
  c.markAsPaid
);

module.exports = router;
