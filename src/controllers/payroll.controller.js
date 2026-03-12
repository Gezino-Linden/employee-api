// File: src/controllers/payroll.controller.js
const PDFDocument = require("pdfkit");
const {
  VAT,
  GL_ACCOUNTS,
  CACHE_TTL,
  PAYMENT_METHODS,
  PAYROLL_STATUSES,
  MONTH_NAMES_SHORT,
  TAX,
  DATE,
} = require("../config/constants");
const db = require("../db");
const { logAudit } = require("../utils/auditLog");

// â”€â”€ VALIDATION HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const VALID_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const VALID_PAYMENT_METHODS = PAYMENT_METHODS;
const VALID_STATUSES = PAYROLL_STATUSES;

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
function toNum(v) {
  return parseFloat(v) || 0;
}

function validateMonth(month) {
  return VALID_MONTHS.includes(month);
}
function validateYear(year) {
  const y = new Date().getFullYear();
  return year >= 2000 && year <= y + 1;
}
function validatePaymentMethod(method) {
  return VALID_PAYMENT_METHODS.includes(method);
}
function validateStatus(status) {
  return VALID_STATUSES.includes(status);
}

// â”€â”€ SA PAYE TAX CALCULATION (2024/2025) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function calculateTax(grossPay, age = 30) {
  const annualGross = grossPay * 12;
  let annualTax;

  if (annualGross <= 237100) annualTax = annualGross * 0.18;
  else if (annualGross <= 370500)
    annualTax = 42678 + (annualGross - 237100) * 0.26;
  else if (annualGross <= 512800)
    annualTax = 77362 + (annualGross - 370500) * 0.31;
  else if (annualGross <= 673000)
    annualTax = 121475 + (annualGross - 512800) * 0.36;
  else if (annualGross <= 857900)
    annualTax = 179147 + (annualGross - 673000) * 0.39;
  else if (annualGross <= 1817000)
    annualTax = 251258 + (annualGross - 857900) * 0.41;
  else annualTax = 644489 + (annualGross - 1817000) * 0.45;

  // Apply rebates from constants
  if (age < 65) annualTax -= TAX.PRIMARY_REBATE;
  else if (age < 75) annualTax -= TAX.PRIMARY_REBATE + TAX.SECONDARY_REBATE;
  else
    annualTax -=
      TAX.PRIMARY_REBATE + TAX.SECONDARY_REBATE + TAX.TERTIARY_REBATE;

  // Check against tax-free thresholds from constants
  let threshold = TAX.THRESHOLD_UNDER_65;
  if (age >= 75) threshold = TAX.THRESHOLD_75_PLUS;
  else if (age >= 65) threshold = TAX.THRESHOLD_65_TO_74;

  if (annualGross <= threshold) return 0;
  return Math.max(0, annualTax / 12);
}

// â”€â”€ GET PAYROLL SUMMARY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getPayrollSummary = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res
        .status(400)
        .json({ error: "Company ID not found in user session" });

    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());

    if (!validateMonth(month))
      return res.status(400).json({ error: "Invalid month (1-12)" });
    if (!validateYear(year))
      return res.status(400).json({ error: "Invalid year" });

    const result = await db.query(
      `SELECT
        CAST(COUNT(*) AS INTEGER)                                        as total_employees,
        COALESCE(SUM(gross_pay), 0)                                      as total_gross,
        COALESCE(SUM(total_deductions), 0)                               as total_deductions,
        COALESCE(SUM(net_pay), 0)                                        as total_net,
        COALESCE(SUM(tax), 0)                                            as tax,
        CAST(COUNT(CASE WHEN status = 'paid'      THEN 1 END) AS INTEGER) as paid_count,
        CAST(COUNT(CASE WHEN status = 'processed' THEN 1 END) AS INTEGER) as processed_count,
        CAST(COUNT(CASE WHEN status = 'draft'     THEN 1 END) AS INTEGER) as draft_count
       FROM payroll_records
       WHERE company_id = $1 AND month = $2 AND year = $3`,
      [companyId, month, year]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch payroll summary", details: err.message });
  }
};

// â”€â”€ GET PAYROLL RECORDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getPayrollRecords = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());
    const status = req.query.status;

    if (!validateMonth(month))
      return res.status(400).json({ error: "Invalid month (1-12)" });
    if (!validateYear(year))
      return res.status(400).json({ error: "Invalid year" });
    if (status && !validateStatus(status))
      return res
        .status(400)
        .json({ error: "Invalid status", valid_statuses: VALID_STATUSES });

    const page = toInt(req.query.page, 1);
    const perPage = Math.min(toInt(req.query.per_page, 50), 100);
    const offset = (page - 1) * perPage;

    let query = `
      SELECT
        pr.id, pr.employee_id,
        e.first_name, e.last_name, e.email, e.department, e.position,
        pr.month, pr.year,
        pr.basic_salary, pr.allowances, pr.bonuses, pr.overtime,
        pr.gross_pay, pr.tax, pr.uif, pr.pension, pr.medical_aid,
        pr.other_deductions, pr.total_deductions, pr.net_pay,
        pr.status, pr.payment_method, pr.payment_date, pr.payment_reference,
        pr.notes, pr.created_at, pr.updated_at
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
    `;
    const params = [companyId, month, year];
    let paramIndex = 3;

    if (status) {
      paramIndex++;
      query += ` AND pr.status = $${paramIndex}`;
      params.push(status);
    }

    query += ` ORDER BY e.last_name, e.first_name`;
    paramIndex++;
    query += ` LIMIT $${paramIndex}`;
    params.push(perPage);
    paramIndex++;
    query += ` OFFSET $${paramIndex}`;
    params.push(offset);

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch payroll records", details: err.message });
  }
};

// â”€â”€ INITIALIZE PAYROLL PERIOD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.initializePayrollPeriod = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const { month, year } = req.body;
    if (!month || !year)
      return res.status(400).json({ error: "Month and year are required" });

    const monthInt = toInt(month, 0);
    const yearInt = toInt(year, 0);

    if (!validateMonth(monthInt))
      return res.status(400).json({ error: "Invalid month (1-12)" });
    if (!validateYear(yearInt))
      return res.status(400).json({ error: "Invalid year" });

    const result = await db.query(
      `SELECT initialize_payroll_period($1, $2, $3) as count`,
      [companyId, monthInt, yearInt]
    );

    return res.json({
      message: `Initialized payroll for ${result.rows[0].count} employees`,
      count: result.rows[0].count,
    });
  } catch (err) {
    return res
      .status(500)
      .json({
        error: "Failed to initialize payroll period",
        details: err.message,
      });
  }
};

// â”€â”€ UPDATE PAYROLL RECORD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.updatePayrollRecord = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const recordId = toInt(req.params.id, 0);
    if (!recordId) return res.status(400).json({ error: "Invalid record ID" });

    const {
      allowances,
      bonuses,
      overtime,
      medical_aid,
      other_deductions,
      notes,
    } = req.body;

    client = await db.connect();
    await client.query("BEGIN");

    const checkResult = await client.query(
      `SELECT pr.*, e.salary AS basic_salary
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.id = $1 AND pr.company_id = $2
       FOR UPDATE`,
      [recordId, companyId]
    );

    if (checkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Payroll record not found" });
    }

    const current = checkResult.rows[0];

    const oldValues = {
      allowances: current.allowances,
      bonuses: current.bonuses,
      overtime: current.overtime,
      medical_aid: current.medical_aid,
      other_deductions: current.other_deductions,
      gross_pay: current.gross_pay,
      tax: current.tax,
      total_deductions: current.total_deductions,
      net_pay: current.net_pay,
    };

    const newAllowances =
      allowances !== undefined ? parseFloat(allowances) : current.allowances;
    const newBonuses =
      bonuses !== undefined ? parseFloat(bonuses) : current.bonuses;
    const newOvertime =
      overtime !== undefined ? parseFloat(overtime) : current.overtime;
    const newMedicalAid =
      medical_aid !== undefined ? parseFloat(medical_aid) : current.medical_aid;
    const newOtherDeductions =
      other_deductions !== undefined
        ? parseFloat(other_deductions)
        : current.other_deductions;

    const newGross =
      parseFloat(current.basic_salary) +
      newAllowances +
      newBonuses +
      newOvertime;
    const newTax = current.custom_tax_rate
      ? newGross * (current.custom_tax_rate / 100)
      : calculateTax(newGross, current.age || 30);

    const newTotalDeductions =
      newTax +
      parseFloat(current.uif) +
      parseFloat(current.pension) +
      newMedicalAid +
      newOtherDeductions;
    const newNet = newGross - newTotalDeductions;

    const result = await client.query(
      `UPDATE payroll_records
       SET allowances = $1, bonuses = $2, overtime = $3,
           medical_aid = $4, other_deductions = $5,
           notes = COALESCE($6, notes),
           gross_pay = $7, tax = $8, total_deductions = $9, net_pay = $10,
           updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [
        newAllowances,
        newBonuses,
        newOvertime,
        newMedicalAid,
        newOtherDeductions,
        notes,
        newGross,
        newTax,
        newTotalDeductions,
        newNet,
        recordId,
      ]
    );

    await client.query(
      `INSERT INTO payroll_audit_log
         (payroll_record_id, changed_by, action, old_values, new_values, notes, created_at)
       VALUES ($1, $2, 'update', $3, $4, $5, NOW())`,
      [
        recordId,
        req.user.id,
        JSON.stringify(oldValues),
        JSON.stringify({
          allowances: newAllowances,
          bonuses: newBonuses,
          overtime: newOvertime,
          medical_aid: newMedicalAid,
          other_deductions: newOtherDeductions,
          gross_pay: newGross,
          tax: newTax,
          total_deductions: newTotalDeductions,
          net_pay: newNet,
        }),
        notes || null,
      ]
    );

    await client.query("COMMIT");
    return res.json(result.rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    return res
      .status(500)
      .json({ error: "Failed to update payroll record", details: err.message });
  } finally {
    if (client) client.release();
  }
};

// â”€â”€ PROCESS PAYROLL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ PROCESS PAYROLL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Replace the existing processPayroll function with this one.
// Everything else in payroll.controller.js stays the same.
exports.processPayroll = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const { employee_ids, month, year } = req.body;
    if (!month || !year)
      return res.status(400).json({ error: "Month and year are required" });

    const monthInt = toInt(month, 0);
    const yearInt  = toInt(year, 0);

    if (!validateMonth(monthInt))
      return res.status(400).json({ error: "Invalid month (1-12)" });
    if (!validateYear(yearInt))
      return res.status(400).json({ error: "Invalid year" });

    if (!employee_ids || !Array.isArray(employee_ids) || employee_ids.length === 0)
      return res.status(400).json({ error: "Employee IDs array is required" });

    const validIds = employee_ids.map((id) => toInt(id, 0)).filter((id) => id > 0);
    if (validIds.length !== employee_ids.length)
      return res.status(400).json({ error: "Invalid employee IDs provided" });

    client = await db.connect();
    await client.query("BEGIN");

    // â”€â”€ Fetch current draft payroll records for these employees â”€â”€
    const drafts = await client.query(
      `SELECT pr.*, e.age, e.salary
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1
         AND pr.month = $2
         AND pr.year  = $3
         AND pr.employee_id = ANY($4)
         AND pr.status = 'draft'`,
      [companyId, monthInt, yearInt, validIds]
    );

    if (drafts.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "No draft payroll records found for these employees" });
    }

    const processed = [];

    for (const record of drafts.rows) {
      // â”€â”€ 1. Pull shift earnings for this employee/month â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const shiftEarnings = await calculateMonthlyShiftPay(
        companyId,
        record.employee_id,
        monthInt,
        yearInt
      );

      // â”€â”€ 2. Pull attendance overtime for this employee/month â”€â”€â”€â”€â”€â”€
      // Sum overtime_pay from attendance_records for the period
      const attendanceResult = await client.query(
        `SELECT
           COALESCE(SUM(overtime_hours), 0) AS total_overtime_hours,
           COALESCE(SUM(overtime_pay),   0) AS total_overtime_pay
         FROM attendance_records
         WHERE company_id  = $1
           AND employee_id = $2
           AND EXTRACT(MONTH FROM date) = $3
           AND EXTRACT(YEAR  FROM date) = $4`,
        [companyId, record.employee_id, monthInt, yearInt]
      );
      const attendance = attendanceResult.rows[0];

      // â”€â”€ 3. Decide how to apply earnings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // If employee has shift assignments this month â†’ use shift pay as overtime
      // If employee has attendance overtime but no shifts â†’ use attendance overtime
      // If neither â†’ keep whatever was manually entered on the draft record
      let newOvertime = toNum(record.overtime);

      if (shiftEarnings.shift_count > 0) {
        // Shift worker: add shift premiums + night pay on top of base salary
        // base_pay is already covered by basic_salary, so we only add the premium/night uplift
        newOvertime = toNum(shiftEarnings.night_pay) + toNum(shiftEarnings.shift_premium);
      } else if (toNum(attendance.total_overtime_pay) > 0) {
        // Salaried worker with recorded overtime
        newOvertime = toNum(attendance.total_overtime_pay);
      }

      // â”€â”€ 4. Recalculate gross â†’ tax â†’ net â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const basicSalary  = toNum(record.basic_salary);
      const allowances   = toNum(record.allowances);
      const bonuses      = toNum(record.bonuses);
      const uif          = toNum(record.uif);
      const pension      = toNum(record.pension);
      const medicalAid   = toNum(record.medical_aid);
      const otherDeduct  = toNum(record.other_deductions);

      const newGross = basicSalary + allowances + bonuses + newOvertime;

      const newTax = record.custom_tax_rate
        ? newGross * (record.custom_tax_rate / 100)
        : calculateTax(newGross, record.age || 30);

      const newTotalDeductions = newTax + uif + pension + medicalAid + otherDeduct;
      const newNet = newGross - newTotalDeductions;

      // â”€â”€ 5. Update the payroll record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      const updated = await client.query(
        `UPDATE payroll_records
         SET status           = 'processed',
             overtime         = $1,
             gross_pay        = $2,
             tax              = $3,
             total_deductions = $4,
             net_pay          = $5,
             updated_at       = NOW()
         WHERE id         = $6
           AND company_id = $7
         RETURNING id, employee_id`,
        [
          newOvertime,
          newGross,
          newTax,
          newTotalDeductions,
          newNet,
          record.id,
          companyId,
        ]
      );

      // â”€â”€ 6. Audit log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      await client.query(
        `INSERT INTO payroll_audit_log
           (payroll_record_id, changed_by, action, old_status, new_status,
            old_values, new_values, notes, created_at)
         VALUES ($1, $2, 'process', 'draft', 'processed', $3, $4, $5, NOW())`,
        [
          record.id,
          req.user.id,
          JSON.stringify({ status: 'draft', overtime: record.overtime, gross_pay: record.gross_pay, net_pay: record.net_pay }),
          JSON.stringify({ status: 'processed', overtime: newOvertime, gross_pay: newGross, net_pay: newNet }),
          shiftEarnings.shift_count > 0
            ? `Shift earnings applied: ${shiftEarnings.shift_count} shifts, night pay R${shiftEarnings.night_pay}, premium R${shiftEarnings.shift_premium}`
            : toNum(attendance.total_overtime_pay) > 0
            ? `Attendance overtime applied: ${attendance.total_overtime_hours}h = R${attendance.total_overtime_pay}`
            : 'No shift/overtime data â€” processed from base salary',
        ]
      );

      processed.push(updated.rows[0]);
    }

    await client.query("COMMIT");
    await logAudit({
      req,
      action: "PROCESS",
      entityType: "payroll",
      entityId: req.body.month,
      entityName: `Payroll ${req.body.month}/${req.body.year}`,
    });

    return res.json({
      message: `Processed ${processed.length} payroll records`,
      count: processed.length,
      processed_ids: processed.map((r) => r.employee_id),
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    return res.status(500).json({ error: "Failed to process payroll", details: err.message });
  } finally {
    if (client) client.release();
  }
};

// â”€â”€ MARK AS PAID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Payroll cost goes to GL expense account (6100 Salaries & Wages)
// NOT to ap_invoices â€” payroll is a direct expense, not a supplier invoice
exports.markAsPaid = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const recordId = toInt(req.params.id, 0);
    if (!recordId) return res.status(400).json({ error: "Invalid record ID" });

    const { payment_method, payment_date, payment_reference } = req.body;

    if (payment_method && !validatePaymentMethod(payment_method))
      return res
        .status(400)
        .json({
          error: "Invalid payment method",
          valid_methods: VALID_PAYMENT_METHODS,
        });
    if (payment_date && isNaN(Date.parse(payment_date)))
      return res
        .status(400)
        .json({ error: "Invalid payment date format", format: "YYYY-MM-DD" });

    client = await db.connect();
    await client.query("BEGIN");

    // 1. Mark record as paid
    const result = await client.query(
      `UPDATE payroll_records
       SET status = 'paid',
           payment_method    = COALESCE($1, payment_method),
           payment_date      = COALESCE($2, payment_date),
           payment_reference = COALESCE($3, payment_reference),
           updated_at        = NOW()
       WHERE id = $4 AND company_id = $5 AND status != 'paid'
       RETURNING *`,
      [payment_method, payment_date, payment_reference, recordId, companyId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      const check = await db.query(
        `SELECT status FROM payroll_records WHERE id = $1 AND company_id = $2`,
        [recordId, companyId]
      );
      if (check.rows.length === 0)
        return res.status(404).json({ error: "Payroll record not found" });
      if (check.rows[0].status === "paid")
        return res.status(409).json({ error: "Record already marked as paid" });
      return res.status(400).json({ error: "Unable to mark as paid" });
    }

    const record = result.rows[0];
    const pDate = payment_date || new Date().toISOString().split("T")[0];

    // 2. Audit log
    await client.query(
      `INSERT INTO payroll_audit_log
         (payroll_record_id, changed_by, action, old_status, new_status, notes, created_at)
       VALUES ($1, $2, 'mark_paid', 'processed', 'paid', $3, NOW())`,
      [recordId, req.user.id, `Payment via ${payment_method || "unknown"}`]
    );

    // 3. Auto-post GL journal lines
    //    Debit: 6100 Salaries & Wages (expense account)
    //    Credit: 2100 PAYE, 2110 Pension, 2130 UIF, 2150 Net Salaries Payable
    //    This is the correct accounting treatment â€” payroll is an expense, not a purchase
    try {
      await client.query(
        `INSERT INTO gl_journal_lines
           (company_id, journal_date, reference, account_code, account_name,
            debit, credit, category, source_type, source_id, created_by)
         VALUES
           ($1,$2,$3,$4,'Salaries & Wages',      $8,  0,   'payroll','payroll_record',$9,$10),
           ($1,$2,$3,$5,'SARS PAYE Liability',     0,  $11, 'payroll','payroll_record',$9,$10),
           ($1,$2,$3,$6,'Pension Liability',        0,  $12, 'payroll','payroll_record',$9,$10),
           ($1,$2,$3,$7,'UIF Liability',            0,  $13, 'payroll','payroll_record',$9,$10),
           ($1,$2,$3,'2150','Net Salaries Payable', 0,  $14, 'payroll','payroll_record',$9,$10)`,
        [
          companyId,
          pDate,
          `PAYROLL-${recordId}`,
          GL_ACCOUNTS.SALARIES_WAGES,
          GL_ACCOUNTS.SARS_PAYE_LIABILITY,
          GL_ACCOUNTS.PENSION_LIABILITY,
          GL_ACCOUNTS.UIF_LIABILITY,
          toNum(record.gross_pay),
          recordId,
          req.user.id,
          toNum(record.tax),
          toNum(record.pension),
          toNum(record.uif),
          toNum(record.net_pay),
        ]
      );
    } catch (glErr) {
      console.warn("GL journal auto-post skipped:", glErr.message);
    }

    // 4. Post PAYE/UIF to tax liability ledger
    try {
      await client.query(
        `INSERT INTO tax_liability_ledger
           (company_id, payroll_record_id, paye_amount, uif_employee,
            uif_employer, sdl_amount, period_month, period_year, status, created_at)
         VALUES ($1, $2, $3, $4, 0, 0, $5, $6, 'outstanding', NOW())
         ON CONFLICT (company_id, payroll_record_id) DO NOTHING`,
        [
          companyId,
          recordId,
          toNum(record.tax),
          toNum(record.uif),
          record.month,
          record.year,
        ]
      );
    } catch (taxErr) {
      console.warn("Tax liability ledger skipped:", taxErr.message);
    }

    await client.query("COMMIT");
    await logAudit({
      req,
      action: "MARK_PAID",
      entityType: "payroll",
      entityId: req.params.id,
      entityName: `Payroll record #${req.params.id}`,
    });
    return res.json({
      ...record,
      gl_journal_posted: true,
      message: "Payment recorded and GL journal auto-posted",
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("ERROR in markAsPaid:", err);
    return res
      .status(500)
      .json({ error: "Failed to mark as paid", details: err.message });
  } finally {
    if (client) client.release();
  }
};

// â”€â”€ GENERATE PAYSLIP (PDF) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.generatePayslip = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const userRole = req.user?.role;
    const userEmployeeId = req.user?.employee_id;

    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const recordId = toInt(req.params.id, 0);
    if (!recordId) return res.status(400).json({ error: "Invalid record ID" });

    const result = await db.query(
      `SELECT
        pr.*,
        e.first_name, e.last_name, e.email, e.position, e.department, e.id as emp_id,
        c.name as company_name, c.currency_code
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      JOIN companies c ON pr.company_id  = c.id
      WHERE pr.id = $1 AND pr.company_id = $2`,
      [recordId, companyId]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Payroll record not found" });

    const record = result.rows[0];

    if (
      userRole !== "admin" &&
      userRole !== "manager" &&
      record.emp_id !== userEmployeeId
    )
      return res
        .status(403)
        .json({ error: "Unauthorized to view this payslip" });

    const currency = record.currency_code || "ZAR";
    const currencySymbol = currency === "ZAR" ? "R" : "$";

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payslip-${record.last_name}-${record.month}-${record.year}.pdf"`
    );
    doc.pipe(res);

    doc.fontSize(24).text("PAYSLIP", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).text(record.company_name, { align: "center" });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Employee: ${record.first_name} ${record.last_name}`);
    doc.text(`Position: ${record.position || "N/A"}`);
    doc.text(`Department: ${record.department || "N/A"}`);
    doc.text(`Period: ${record.month}/${record.year}`);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).text("EARNINGS", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Basic Salary:`, 50, doc.y, { continued: true });
    doc.text(
      `${currencySymbol} ${parseFloat(record.basic_salary).toFixed(2)}`,
      { align: "right" }
    );
    doc.text(`Allowances:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.allowances).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Bonuses:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.bonuses).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Overtime:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.overtime).toFixed(2)}`, {
      align: "right",
    });
    doc.moveDown();
    doc.fontSize(13).text(`GROSS PAY:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.gross_pay).toFixed(2)}`, {
      align: "right",
    });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).text("DEDUCTIONS", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`PAYE Tax:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.tax).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`UIF:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.uif).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Pension:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.pension).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Medical Aid:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.medical_aid).toFixed(2)}`, {
      align: "right",
    });
    doc.text(`Other:`, 50, doc.y, { continued: true });
    doc.text(
      `${currencySymbol} ${parseFloat(record.other_deductions).toFixed(2)}`,
      { align: "right" }
    );
    doc.moveDown();
    doc.fontSize(13).text(`TOTAL DEDUCTIONS:`, 50, doc.y, { continued: true });
    doc.text(
      `${currencySymbol} ${parseFloat(record.total_deductions).toFixed(2)}`,
      { align: "right" }
    );
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(16).text(`NET PAY:`, 50, doc.y, { continued: true });
    doc.text(`${currencySymbol} ${parseFloat(record.net_pay).toFixed(2)}`, {
      align: "right",
    });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Payment Status: ${record.status.toUpperCase()}`);
    if (record.payment_date) doc.text(`Payment Date: ${record.payment_date}`);
    if (record.payment_method)
      doc.text(`Payment Method: ${record.payment_method}`);
    if (record.payment_reference)
      doc.text(`Reference: ${record.payment_reference}`);

    doc.moveDown(2);
    doc
      .fontSize(10)
      .text("This is a computer-generated payslip.", { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });

    doc.end();
  } catch (err) {
    console.error("ERROR in generatePayslip:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate payslip", details: err.message });
  }
};

// â”€â”€ GET PAYROLL HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getPayrollHistory = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const employeeId = toInt(req.query.employee_id, 0);
    const page = toInt(req.query.page, 1);
    const perPage = Math.min(toInt(req.query.per_page, 50), 100);
    const offset = (page - 1) * perPage;

    let query = `
      SELECT
        pr.id, pr.month, pr.year, pr.gross_pay, pr.total_deductions, pr.net_pay, pr.status,
        pr.payment_method, pr.payment_date,
        e.first_name, e.last_name, e.id as emp_id
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 1;

    if (employeeId > 0) {
      paramIndex++;
      query += ` AND pr.employee_id = $${paramIndex}`;
      params.push(employeeId);
    }

    paramIndex++;
    query += ` ORDER BY pr.year DESC, pr.month DESC LIMIT $${paramIndex}`;
    params.push(perPage);
    paramIndex++;
    query += ` OFFSET $${paramIndex}`;
    params.push(offset);

    const result = await db.query(query, params);

    let countQuery = `SELECT CAST(COUNT(*) AS INTEGER) as total FROM payroll_records pr JOIN employees e ON pr.employee_id = e.id WHERE pr.company_id = $1`;
    const countParams = [companyId];
    if (employeeId > 0) {
      countQuery += ` AND pr.employee_id = $2`;
      countParams.push(employeeId);
    }

    const countResult = await db.query(countQuery, countParams);

    return res.json({
      data: result.rows,
      pagination: {
        page,
        per_page: perPage,
        total: countResult.rows[0].total,
        total_pages: Math.ceil(countResult.rows[0].total / perPage),
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch payroll history", details: err.message });
  }
};

// â”€â”€ SHIFT PAY CALCULATION HELPERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function calculateNightHours(clockIn, clockOut) {
  const NIGHT_START = 18;
  const NIGHT_END = 6;
  const clockInDate = new Date(clockIn);
  const clockOutDate = new Date(clockOut);
  let nightHours = 0;
  const totalHours = (clockOutDate - clockInDate) / (1000 * 60 * 60);
  for (let i = 0; i < Math.ceil(totalHours); i++) {
    const hour = new Date(
      clockInDate.getTime() + i * 60 * 60 * 1000
    ).getHours();
    if (hour >= NIGHT_START || hour < NIGHT_END) nightHours++;
  }
  return Math.min(nightHours, totalHours);
}

async function checkPublicHoliday(date) {
  try {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];
    const result = await db.query(
      `SELECT 1 FROM public_holidays WHERE date = $1 LIMIT 1`,
      [dateStr]
    );
    return result.rows.length > 0;
  } catch (err) {
    return false;
  }
}

async function calculateShiftPay(employee, shift, attendance) {
  try {
    let hourlyRate = employee.salary / 173;
    if (!hourlyRate && employee.salary) hourlyRate = employee.salary / 160;

    const totalHours = attendance.total_hours || 8;
    let basePay = hourlyRate * totalHours;
    if (shift?.base_rate_multiplier) basePay *= shift.base_rate_multiplier;

    let nightHours = 0,
      nightPay = 0;
    if (attendance.clock_in && attendance.clock_out) {
      nightHours = calculateNightHours(
        attendance.clock_in,
        attendance.clock_out
      );
      if (nightHours > 0) nightPay = hourlyRate * nightHours * 0.1;
    }

    const isSunday = new Date(attendance.date).getDay() === 0;
    const isPublicHoliday = await checkPublicHoliday(attendance.date);

    let premiumMultiplier = 1.0;
    let premiumType = "regular";

    if (isPublicHoliday) {
      premiumMultiplier = 2.0;
      premiumType = "public_holiday";
    } else if (isSunday) {
      premiumMultiplier = 2.0;
      premiumType = "sunday";
    }

    const shiftPremium =
      premiumMultiplier > 1.0 ? basePay * (premiumMultiplier - 1.0) : 0;
    const totalPay = basePay + shiftPremium + nightPay;

    return {
      hourly_rate: parseFloat(hourlyRate.toFixed(2)),
      total_hours: parseFloat(totalHours.toFixed(2)),
      night_hours: parseFloat(nightHours.toFixed(2)),
      base_pay: parseFloat(basePay.toFixed(2)),
      night_pay: parseFloat(nightPay.toFixed(2)),
      shift_premium: parseFloat(shiftPremium.toFixed(2)),
      premium_type: premiumType,
      premium_multiplier: premiumMultiplier,
      is_sunday: isSunday,
      is_public_holiday: isPublicHoliday,
      total_pay: parseFloat(totalPay.toFixed(2)),
    };
  } catch (err) {
    return {
      hourly_rate: 0,
      total_hours: 0,
      night_hours: 0,
      base_pay: 0,
      night_pay: 0,
      shift_premium: 0,
      premium_type: "error",
      premium_multiplier: 1.0,
      is_sunday: false,
      is_public_holiday: false,
      total_pay: 0,
      error: err.message,
    };
  }
}

async function calculateMonthlyShiftPay(companyId, employeeId, month, year) {
  try {
    const shifts = await db.query(
      `SELECT es.*, st.base_rate_multiplier, st.is_night_shift,
              ar.clock_in, ar.clock_out, ar.total_hours,
              e.salary
       FROM employee_shifts es
       JOIN shift_templates st ON es.shift_template_id = st.id
       LEFT JOIN attendance_records ar ON es.attendance_record_id = ar.id
       JOIN employees e ON es.employee_id = e.id
       WHERE es.company_id = $1 AND es.employee_id = $2
         AND EXTRACT(MONTH FROM es.shift_date) = $3
         AND EXTRACT(YEAR  FROM es.shift_date) = $4
         AND es.status = 'completed'`,
      [companyId, employeeId, month, year]
    );

    let totalBasePay = 0,
      totalNightPay = 0,
      totalShiftPremium = 0,
      totalHours = 0,
      totalNightHours = 0;

    for (const shift of shifts.rows) {
      const p = await calculateShiftPay(
        { hourly_rate: shift.hourly_rate, salary: shift.salary },
        { base_rate_multiplier: shift.base_rate_multiplier },
        {
          date: shift.shift_date,
          clock_in: shift.clock_in,
          clock_out: shift.clock_out,
          total_hours: shift.actual_hours_worked || shift.total_hours,
        }
      );
      totalBasePay += p.base_pay;
      totalNightPay += p.night_pay;
      totalShiftPremium += p.shift_premium;
      totalHours += p.total_hours;
      totalNightHours += p.night_hours;
    }

    return {
      shift_count: shifts.rows.length,
      total_hours: parseFloat(totalHours.toFixed(2)),
      total_night_hours: parseFloat(totalNightHours.toFixed(2)),
      base_pay: parseFloat(totalBasePay.toFixed(2)),
      night_pay: parseFloat(totalNightPay.toFixed(2)),
      shift_premium: parseFloat(totalShiftPremium.toFixed(2)),
      total_pay: parseFloat(
        (totalBasePay + totalNightPay + totalShiftPremium).toFixed(2)
      ),
    };
  } catch (err) {
    return {
      shift_count: 0,
      total_hours: 0,
      total_night_hours: 0,
      base_pay: 0,
      night_pay: 0,
      shift_premium: 0,
      total_pay: 0,
      error: err.message,
    };
  }
}

// â”€â”€ GET SHIFT EARNINGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.getShiftEarnings = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { employee_id, month, year } = req.query;

    if (!companyId || !employee_id || !month || !year)
      return res
        .status(400)
        .json({
          error: "company_id, employee_id, month, and year are required",
        });

    const earnings = await calculateMonthlyShiftPay(
      companyId,
      toInt(employee_id, 0),
      toInt(month, 0),
      toInt(year, 0)
    );
    return res.json(earnings);
  } catch (err) {
    return res
      .status(500)
      .json({
        error: "Failed to calculate shift earnings",
        details: err.message,
      });
  }
};

// Export helpers
exports.calculateShiftPay = calculateShiftPay;
exports.calculateNightHours = calculateNightHours;
exports.checkPublicHoliday = checkPublicHoliday;
exports.calculateMonthlyShiftPay = calculateMonthlyShiftPay;




