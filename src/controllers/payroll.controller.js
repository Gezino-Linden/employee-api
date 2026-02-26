// File: src/controllers/payroll.controller.js
const db = require("../db");

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// =====================================================
// GET PAYROLL SUMMARY
// Get summary statistics for a payroll period
// =====================================================
exports.getPayrollSummary = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());

    const result = await db.query(
      `SELECT 
    COUNT(*)::int as total_employees,
    COALESCE(SUM(gross_pay), 0) as total_gross,
    COALESCE(SUM(total_deductions), 0) as total_deductions,
    COALESCE(SUM(net_pay), 0) as total_net,
    COALESCE(SUM(tax), 0) as tax,  // <-- ADD THIS LINE
    COUNT(CASE WHEN status = 'paid' THEN 1 END)::int as paid_count,
    COUNT(CASE WHEN status = 'processed' THEN 1 END)::int as processed_count,
    COUNT(CASE WHEN status = 'draft' THEN 1 END)::int as draft_count
   FROM payroll_records
   WHERE company_id = $1 AND month = $2 AND year = $3`,
      [companyId, month, year]
    );

    // ✅ ONLY CHANGE: Return the data even if empty (don't return 404)
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch payroll summary" });
  }
};
// =====================================================
// GET PAYROLL RECORDS
// Get all payroll records for a period
// =====================================================
exports.getPayrollRecords = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());
    const status = req.query.status;

    let query = `
      SELECT 
        pr.id,
        pr.employee_id,
        e.first_name,
        e.last_name,
        e.email,
        e.department,
        e.position,
        pr.month,
        pr.year,
        pr.basic_salary,
        pr.allowances,
        pr.bonuses,
        pr.overtime,
        pr.gross_pay,
        pr.tax,
        pr.uif,
        pr.pension,
        pr.medical_aid,
        pr.other_deductions,
        pr.total_deductions,
        pr.net_pay,
        pr.status,
        pr.payment_method,
        pr.payment_date,
        pr.payment_reference,
        pr.notes,
        pr.created_at,
        pr.updated_at
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
    `;

    const params = [companyId, month, year];

    if (status) {
      query += ` AND pr.status = $4`;
      params.push(status);
    }

    query += ` ORDER BY e.last_name, e.first_name`;

    const result = await db.query(query, params);

    // ✅ ONLY CHANGE: Always return array (even if empty)
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch payroll records" });
  }
};

// =====================================================
// INITIALIZE PAYROLL PERIOD
// Create payroll records for all active employees
// =====================================================
exports.initializePayrollPeriod = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    const result = await db.query(
      `SELECT initialize_payroll_period($1, $2, $3) as count`,
      [companyId, month, year]
    );

    return res.json({
      message: `Initialized payroll for ${result.rows[0].count} employees`,
      count: result.rows[0].count,
    });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to initialize payroll period" });
  }
};

// =====================================================
// UPDATE PAYROLL RECORD
// Update allowances, bonuses, overtime, or other fields
// =====================================================
exports.updatePayrollRecord = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const recordId = toInt(req.params.id, 0);
    const {
      allowances,
      bonuses,
      overtime,
      medical_aid,
      other_deductions,
      notes,
    } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: "Invalid record ID" });
    }

    // Verify record belongs to company
    const checkResult = await db.query(
      `SELECT id FROM payroll_records WHERE id = $1 AND company_id = $2`,
      [recordId, companyId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Payroll record not found" });
    }

    const result = await db.query(
      `UPDATE payroll_records
       SET 
         allowances = COALESCE($1, allowances),
         bonuses = COALESCE($2, bonuses),
         overtime = COALESCE($3, overtime),
         medical_aid = COALESCE($4, medical_aid),
         other_deductions = COALESCE($5, other_deductions),
         notes = COALESCE($6, notes),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        allowances,
        bonuses,
        overtime,
        medical_aid,
        other_deductions,
        notes,
        recordId,
      ]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update payroll record" });
  }
};

// =====================================================
// PROCESS PAYROLL
// Mark selected records as processed
// =====================================================
exports.processPayroll = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { employee_ids, month, year } = req.body;

    if (
      !employee_ids ||
      !Array.isArray(employee_ids) ||
      employee_ids.length === 0
    ) {
      return res.status(400).json({ error: "Employee IDs array is required" });
    }

    await db.query("BEGIN");

    // Update status to processed
    const result = await db.query(
      `UPDATE payroll_records
       SET status = 'processed', updated_at = NOW()
       WHERE company_id = $1 AND month = $2 AND year = $3 
         AND employee_id = ANY($4) AND status = 'draft'
       RETURNING id`,
      [companyId, month, year, employee_ids]
    );

    // Log audit trail
    for (const row of result.rows) {
      await db.query(
        `INSERT INTO payroll_audit_log (payroll_record_id, changed_by, action, old_status, new_status)
         VALUES ($1, $2, 'process', 'draft', 'processed')`,
        [row.id, req.user.id]
      );
    }

    await db.query("COMMIT");

    return res.json({
      message: `Processed ${result.rows.length} payroll records`,
      count: result.rows.length,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to process payroll" });
  }
};

// =====================================================
// MARK AS PAID
// Mark a payroll record as paid
// =====================================================
exports.markAsPaid = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const recordId = toInt(req.params.id, 0);
    const { payment_method, payment_date, payment_reference } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: "Invalid record ID" });
    }

    await db.query("BEGIN");

    const result = await db.query(
      `UPDATE payroll_records
       SET 
         status = 'paid',
         payment_method = $1,
         payment_date = $2,
         payment_reference = $3,
         updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [payment_method, payment_date, payment_reference, recordId, companyId]
    );

    if (result.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Payroll record not found" });
    }

    // Log audit trail
    await db.query(
      `INSERT INTO payroll_audit_log (payroll_record_id, changed_by, action, old_status, new_status, notes)
       VALUES ($1, $2, 'mark_paid', 'processed', 'paid', $3)`,
      [recordId, req.user.id, `Payment via ${payment_method}`]
    );

    await db.query("COMMIT");

    return res.json(result.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to mark as paid" });
  }
};

// =====================================================
// GENERATE PAYSLIP (Simple PDF)
// =====================================================
exports.generatePayslip = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const recordId = toInt(req.params.id, 0);

    if (!recordId) {
      return res.status(400).json({ error: "Invalid record ID" });
    }

    // Get payroll record with employee details
    const result = await db.query(
      `SELECT 
    pr.*,
    e.first_name, e.last_name, e.email, e.position, e.department
   FROM payroll_records pr
   JOIN employees e ON pr.employee_id = e.id
   WHERE pr.id = $1 AND pr.company_id = $2`,
      [recordId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payroll record not found" });
    }

    const record = result.rows[0];

    // Simple text-based payslip (you can upgrade to PDF library later)
    const payslip = `
===========================================
         PAYSLIP - Company ID: ${record.company_id}
===========================================
Employee: ${record.first_name} ${record.last_name}
Position: ${record.position}
Department: ${record.department}
Period: ${record.month}/${record.year}
-------------------------------------------
EARNINGS:
  Basic Salary:      R ${record.basic_salary.toFixed(2)}
  Allowances:        R ${record.allowances.toFixed(2)}
  Bonuses:           R ${record.bonuses.toFixed(2)}
  Overtime:          R ${record.overtime.toFixed(2)}
                    ────────────────
  GROSS PAY:         R ${record.gross_pay.toFixed(2)}

DEDUCTIONS:
  PAYE Tax:          R ${record.tax.toFixed(2)}
  UIF:               R ${record.uif.toFixed(2)}
  Pension:           R ${record.pension.toFixed(2)}
  Medical Aid:       R ${record.medical_aid.toFixed(2)}
  Other:             R ${record.other_deductions.toFixed(2)}
                    ────────────────
  TOTAL DEDUCTIONS:  R ${record.total_deductions.toFixed(2)}

═══════════════════════════════════════════
  NET PAY:           R ${record.net_pay.toFixed(2)}
═══════════════════════════════════════════

Payment Status: ${record.status.toUpperCase()}
${record.payment_date ? `Payment Date: ${record.payment_date}` : ""}
${record.payment_method ? `Payment Method: ${record.payment_method}` : ""}

Generated: ${new Date().toLocaleString()}
    `;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payslip-${recordId}.txt"`
    );
    return res.send(payslip);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate payslip" });
  }
};

// =====================================================
// GET PAYROLL HISTORY
// Get payroll records across multiple periods
// =====================================================
exports.getPayrollHistory = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = toInt(req.query.employee_id, 0);
    const limit = toInt(req.query.limit, 12);

    let query = `
      SELECT 
        pr.id, pr.month, pr.year, pr.gross_pay, pr.total_deductions, pr.net_pay, pr.status,
        e.first_name, e.last_name
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1
    `;

    const params = [companyId];

    if (employeeId > 0) {
      query += ` AND pr.employee_id = $2`;
      params.push(employeeId);
    }

    query += ` ORDER BY pr.year DESC, pr.month DESC LIMIT $${
      params.length + 1
    }`;
    params.push(limit);

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch payroll history" });
  }
};
