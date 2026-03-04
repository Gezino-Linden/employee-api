// File: src/routes/payroll.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const c = require("../controllers/payroll.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, payrollValidators } = require("../middleware/validate");

// ── Summary, Records, History, Payslip ───────────────────────
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

// ── Periods endpoint (used by accounting journal generator) ───
// Tries payroll_periods table first, falls back to payroll_records
router.get("/periods", requireAuth, async (req, res) => {
  try {
    const companyId = req.user?.company_id;

    // First try payroll_periods table
    const periodsCheck = await db.query(
      `SELECT COUNT(*) as total FROM payroll_periods`
    );

    if (parseInt(periodsCheck.rows[0].total) > 0) {
      // Table has data — use it directly
      const result = await db.query(
        `SELECT id, period_start, period_end, status
         FROM payroll_periods
         ORDER BY period_start DESC
         LIMIT 24`
      );
      return res.json({
        success: true,
        count: result.rows.length,
        data: result.rows,
      });
    }

    // Fallback: build periods from payroll_records
    const result = await db.query(
      `SELECT
         CONCAT(year, '-', LPAD(month::text, 2, '0'))  as id,
         MAKE_DATE(year, month, 1)                      as period_start,
         (MAKE_DATE(year, month, 1)
           + INTERVAL '1 month - 1 day')::date          as period_end,
         'completed'                                     as status,
         COUNT(*)                                        as employee_count
       FROM payroll_records
       WHERE company_id = $1
       GROUP BY year, month
       ORDER BY year DESC, month DESC
       LIMIT 24`,
      [companyId]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error("GET /payroll/periods error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Initialize ────────────────────────────────────────────────
router.post(
  "/initialize",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.initialize),
  c.initializePayrollPeriod
);

// ── Process ───────────────────────────────────────────────────
router.post(
  "/process",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.process),
  c.processPayroll
);

// ── Update record ─────────────────────────────────────────────
router.patch(
  "/records/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.update),
  c.updatePayrollRecord
);

// ── Mark as paid ──────────────────────────────────────────────
router.patch(
  "/records/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(payrollValidators.markPaid),
  c.markAsPaid
);

module.exports = router;
