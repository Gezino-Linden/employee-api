// File: src/routes/payroll.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const c = require("../controllers/payroll.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, payrollValidators } = require("../middleware/validate");

// Roles that can view payroll
const canView = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "hr_manager",
  "accountant",
];
// Roles that can process/modify payroll
const canProcess = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "accountant",
];

router.get(
  "/summary",
  requireAuth,
  requireRoles(...canView),
  c.getPayrollSummary
);
router.get(
  "/records",
  requireAuth,
  requireRoles(...canView),
  c.getPayrollRecords
);
router.get("/history", requireAuth, c.getPayrollHistory);
router.get("/payslip/:id", requireAuth, c.generatePayslip);

// Periods endpoint
router.get("/periods", requireAuth, async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const periodsCheck = await db.query(
      `SELECT COUNT(*) as total FROM payroll_periods`
    );
    if (parseInt(periodsCheck.rows[0].total) > 0) {
      const result = await db.query(
        `SELECT id, period_start, period_end, status FROM payroll_periods ORDER BY period_start DESC LIMIT 24`
      );
      return res.json({
        success: true,
        count: result.rows.length,
        data: result.rows,
      });
    }
    const result = await db.query(
      `SELECT CONCAT(year, '-', LPAD(month::text, 2, '0')) as id,
              MAKE_DATE(year, month, 1) as period_start,
              (MAKE_DATE(year, month, 1) + INTERVAL '1 month - 1 day')::date as period_end,
              'completed' as status, COUNT(*) as employee_count
       FROM payroll_records WHERE company_id = $1
       GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 24`,
      [companyId]
    );
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post(
  "/initialize",
  requireAuth,
  requireRoles(...canProcess),
  validate(payrollValidators.initialize),
  c.initializePayrollPeriod
);
router.post(
  "/process",
  requireAuth,
  requireRoles(...canProcess),
  validate(payrollValidators.process),
  c.processPayroll
);
router.patch(
  "/records/:id",
  requireAuth,
  requireRoles(...canProcess),
  validate(payrollValidators.update),
  c.updatePayrollRecord
);
router.patch(
  "/records/:id/pay",
  requireAuth,
  requireRoles(...canProcess),
  validate(payrollValidators.markPaid),
  c.markAsPaid
);

module.exports = router;
