// File: src/controllers/payroll.controller.js
const PDFDocument = require("pdfkit");
const db = require("../db");


// =====================================================
// VALIDATION HELPERS
// =====================================================
const VALID_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const VALID_PAYMENT_METHODS = ["bank_transfer", "cash", "check", "crypto"];
const VALID_STATUSES = ["draft", "processed", "paid"];

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function validateMonth(month) {
  return VALID_MONTHS.includes(month);
}

function validateYear(year) {
  const currentYear = new Date().getFullYear();
  return year >= 2000 && year <= currentYear + 1;
}

function validatePaymentMethod(method) {
  return VALID_PAYMENT_METHODS.includes(method);
}

function validateStatus(status) {
  return VALID_STATUSES.includes(status);
}

// Simplified South African tax calculation (2024 tax brackets)
function calculateTax(grossPay) {
  const annualGross = grossPay * 12;
  let annualTax;

  if (annualGross <= 237100) {
    annualTax = annualGross * 0.18;
  } else if (annualGross <= 370500) {
    annualTax = 42678 + (annualGross - 237100) * 0.26;
  } else if (annualGross <= 512800) {
    annualTax = 77362 + (annualGross - 370500) * 0.31;
  } else if (annualGross <= 673000) {
    annualTax = 121475 + (annualGross - 512800) * 0.36;
  } else if (annualGross <= 857900) {
    annualTax = 179147 + (annualGross - 673000) * 0.39;
  } else if (annualGross <= 1817000) {
    annualTax = 251258 + (annualGross - 857900) * 0.41;
  } else {
    annualTax = 644489 + (annualGross - 1817000) * 0.45;
  }

  return Math.max(0, annualTax / 12);
}

// =====================================================
// GET PAYROLL SUMMARY
// =====================================================
exports.getPayrollSummary = async (req, res) => {
  try {
    console.log("=== getPayrollSummary called ===");
    console.log("req.user:", req.user);

    const companyId = req.user?.company_id;
    if (!companyId) {
      console.error("No company_id in req.user");
      return res
        .status(400)
        .json({ error: "Company ID not found in user session" });
    }

    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());

    console.log("companyId:", companyId, "month:", month, "year:", year);

    if (!validateMonth(month)) {
      return res.status(400).json({ error: "Invalid month (1-12)" });
    }
    if (!validateYear(year)) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const result = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_employees,
        COALESCE(SUM(gross_pay), 0) as total_gross,
        COALESCE(SUM(total_deductions), 0) as total_deductions,
        COALESCE(SUM(net_pay), 0) as total_net,
        COALESCE(SUM(tax), 0) as tax,
        CAST(COUNT(CASE WHEN status = 'paid' THEN 1 END) AS INTEGER) as paid_count,
        CAST(COUNT(CASE WHEN status = 'processed' THEN 1 END) AS INTEGER) as processed_count,
        CAST(COUNT(CASE WHEN status = 'draft' THEN 1 END) AS INTEGER) as draft_count
       FROM payroll_records
       WHERE company_id = $1 AND month = $2 AND year = $3`,
      [companyId, month, year]
    );

    console.log("Query result:", result.rows[0]);

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("=== ERROR in getPayrollSummary ===");
    console.error("Error message:", err.message);
    console.error("Error stack:", err.stack);
    return res.status(500).json({
      error: "Failed to fetch payroll summary",
      details: err.message,
    });
  }
};

// =====================================================
// GET PAYROLL RECORDS
// =====================================================
exports.getPayrollRecords = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());
    const status = req.query.status;

    if (!validateMonth(month)) {
      return res.status(400).json({ error: "Invalid month (1-12)" });
    }
    if (!validateYear(year)) {
      return res.status(400).json({ error: "Invalid year" });
    }
    if (status && !validateStatus(status)) {
      return res.status(400).json({
        error: "Invalid status",
        valid_statuses: VALID_STATUSES,
      });
    }

    const page = toInt(req.query.page, 1);
    const perPage = Math.min(toInt(req.query.per_page, 50), 100);
    const offset = (page - 1) * perPage;

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

    let countQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) as total 
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
    `;
    const countParams = [companyId, month, year];

    if (status) {
      countQuery += ` AND pr.status = $4`;
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);

    // NOTE: frontend expects an array, not paginated object
    // Return flat array to stay compatible with existing frontend
    return res.json(result.rows);
  } catch (err) {
    console.error("=== ERROR in getPayrollRecords ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch payroll records",
      details: err.message,
    });
  }
};

// =====================================================
// INITIALIZE PAYROLL PERIOD
// =====================================================
exports.initializePayrollPeriod = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    const monthInt = toInt(month, 0);
    const yearInt = toInt(year, 0);

    if (!validateMonth(monthInt)) {
      return res.status(400).json({ error: "Invalid month (1-12)" });
    }
    if (!validateYear(yearInt)) {
      return res.status(400).json({ error: "Invalid year" });
    }

    const result = await db.query(
      `SELECT initialize_payroll_period($1, $2, $3) as count`,
      [companyId, monthInt, yearInt]
    );

    return res.json({
      message: `Initialized payroll for ${result.rows[0].count} employees`,
      count: result.rows[0].count,
    });
  } catch (err) {
    console.error("=== ERROR in initializePayrollPeriod ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to initialize payroll period",
      details: err.message,
    });
  }
};

// =====================================================
// UPDATE PAYROLL RECORD
// =====================================================
exports.updatePayrollRecord = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

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

    client = await db.connect();
    await client.query("BEGIN");

    const checkResult = await client.query(
      `SELECT pr.*, e.basic_salary, e.custom_tax_rate
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
      : calculateTax(newGross);

    const newTotalDeductions =
      newTax +
      parseFloat(current.uif) +
      parseFloat(current.pension) +
      newMedicalAid +
      newOtherDeductions;
    const newNet = newGross - newTotalDeductions;

    const result = await client.query(
      `UPDATE payroll_records
       SET 
         allowances = $1,
         bonuses = $2,
         overtime = $3,
         medical_aid = $4,
         other_deductions = $5,
         notes = COALESCE($6, notes),
         gross_pay = $7,
         tax = $8,
         total_deductions = $9,
         net_pay = $10,
         updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
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
    console.error("=== ERROR in updatePayrollRecord ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to update payroll record",
      details: err.message,
    });
  } finally {
    if (client) client.release();
  }
};

// =====================================================
// PROCESS PAYROLL
// =====================================================
exports.processPayroll = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

    const { employee_ids, month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    const monthInt = toInt(month, 0);
    const yearInt = toInt(year, 0);

    if (!validateMonth(monthInt)) {
      return res.status(400).json({ error: "Invalid month (1-12)" });
    }
    if (!validateYear(yearInt)) {
      return res.status(400).json({ error: "Invalid year" });
    }

    if (
      !employee_ids ||
      !Array.isArray(employee_ids) ||
      employee_ids.length === 0
    ) {
      return res.status(400).json({ error: "Employee IDs array is required" });
    }

    const validIds = employee_ids
      .map((id) => toInt(id, 0))
      .filter((id) => id > 0);
    if (validIds.length !== employee_ids.length) {
      return res.status(400).json({ error: "Invalid employee IDs provided" });
    }

    client = await db.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE payroll_records
       SET status = 'processed', updated_at = NOW()
       WHERE company_id = $1 AND month = $2 AND year = $3 
         AND employee_id = ANY($4) AND status = 'draft'
       RETURNING id, employee_id`,
      [companyId, monthInt, yearInt, validIds]
    );

    for (const row of result.rows) {
      await client.query(
        `INSERT INTO payroll_audit_log (payroll_record_id, changed_by, action, old_status, new_status, created_at)
         VALUES ($1, $2, 'process', 'draft', 'processed', NOW())`,
        [row.id, req.user.id]
      );
    }

    await client.query("COMMIT");

    return res.json({
      message: `Processed ${result.rows.length} payroll records`,
      count: result.rows.length,
      processed_ids: result.rows.map((r) => r.employee_id),
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("=== ERROR in processPayroll ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to process payroll",
      details: err.message,
    });
  } finally {
    if (client) client.release();
  }
};

// =====================================================
// MARK AS PAID
// =====================================================
exports.markAsPaid = async (req, res) => {
  let client;
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

    const recordId = toInt(req.params.id, 0);
    const { payment_method, payment_date, payment_reference } = req.body;

    if (!recordId) {
      return res.status(400).json({ error: "Invalid record ID" });
    }

    if (payment_method && !validatePaymentMethod(payment_method)) {
      return res.status(400).json({
        error: "Invalid payment method",
        valid_methods: VALID_PAYMENT_METHODS,
      });
    }

    if (payment_date && isNaN(Date.parse(payment_date))) {
      return res.status(400).json({
        error: "Invalid payment date format",
        format: "YYYY-MM-DD",
      });
    }

    client = await db.connect();
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE payroll_records
       SET 
         status = 'paid',
         payment_method = COALESCE($1, payment_method),
         payment_date = COALESCE($2, payment_date),
         payment_reference = COALESCE($3, payment_reference),
         updated_at = NOW()
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
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "Payroll record not found" });
      }
      if (check.rows[0].status === "paid") {
        return res.status(409).json({ error: "Record already marked as paid" });
      }
      return res.status(400).json({ error: "Unable to mark as paid" });
    }

    await client.query(
      `INSERT INTO payroll_audit_log (payroll_record_id, changed_by, action, old_status, new_status, notes, created_at)
       VALUES ($1, $2, 'mark_paid', 'processed', 'paid', $3, NOW())`,
      [recordId, req.user.id, `Payment via ${payment_method || "unknown"}`]
    );

    await client.query("COMMIT");

    return res.json(result.rows[0]);
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("=== ERROR in markAsPaid ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to mark as paid",
      details: err.message,
    });
  } finally {
    if (client) client.release();
  }
};

// =====================================================
// GENERATE PAYSLIP
// =====================================================
exports.generatePayslip = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const userRole = req.user?.role;
    const userEmployeeId = req.user?.employee_id;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

    const recordId = toInt(req.params.id, 0);

    if (!recordId) {
      return res.status(400).json({ error: "Invalid record ID" });
    }

    const result = await db.query(
      `SELECT 
        pr.*,
        e.first_name, e.last_name, e.email, e.position, e.department, e.id as emp_id,
        c.name as company_name, c.currency_code
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      JOIN companies c ON pr.company_id = c.id
      WHERE pr.id = $1 AND pr.company_id = $2`,
      [recordId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Payroll record not found" });
    }

    const record = result.rows[0];

    if (
      userRole !== "admin" &&
      userRole !== "manager" &&
      record.emp_id !== userEmployeeId
    ) {
      return res
        .status(403)
        .json({ error: "Unauthorized to view this payslip" });
    }

    const currency = record.currency_code || "ZAR";
    const currencySymbol = currency === "ZAR" ? "R" : "$";

    // Create PDF
    const doc = new PDFDocument();

    // Set PDF headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payslip-${record.last_name}-${record.month}-${record.year}.pdf"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // === PDF CONTENT ===

    // Header
    doc.fontSize(24).text("PAYSLIP", { align: "center" });
    doc.moveDown(0.5);

    // Company Info
    doc.fontSize(14).text(record.company_name, { align: "center" });
    doc.moveDown();

    // Employee Details
    doc.fontSize(12);
    doc.text(`Employee: ${record.first_name} ${record.last_name}`);
    doc.text(`Position: ${record.position || "N/A"}`);
    doc.text(`Department: ${record.department || "N/A"}`);
    doc.text(`Period: ${record.month}/${record.year}`);
    doc.moveDown();

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // EARNINGS
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
    doc
      .fontSize(13)
      .text(`GROSS PAY:`, 50, doc.y, { continued: true, bold: true });
    doc.text(`${currencySymbol} ${parseFloat(record.gross_pay).toFixed(2)}`, {
      align: "right",
      bold: true,
    });
    doc.moveDown();

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // DEDUCTIONS
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
    doc
      .fontSize(13)
      .text(`TOTAL DEDUCTIONS:`, 50, doc.y, { continued: true, bold: true });
    doc.text(
      `${currencySymbol} ${parseFloat(record.total_deductions).toFixed(2)}`,
      { align: "right", bold: true }
    );
    doc.moveDown();

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // NET PAY
    doc
      .fontSize(16)
      .text(`NET PAY:`, 50, doc.y, { continued: true, bold: true });
    doc.text(`${currencySymbol} ${parseFloat(record.net_pay).toFixed(2)}`, {
      align: "right",
      bold: true,
    });
    doc.moveDown(2);

    // Payment Info
    doc.fontSize(11);
    doc.text(`Payment Status: ${record.status.toUpperCase()}`);

    if (record.payment_date) {
      doc.text(`Payment Date: ${record.payment_date}`);
    }

    if (record.payment_method) {
      doc.text(`Payment Method: ${record.payment_method}`);
    }

    if (record.payment_reference) {
      doc.text(`Reference: ${record.payment_reference}`);
    }

    // Footer
    doc.moveDown(2);
    doc
      .fontSize(10)
      .text("This is a computer-generated payslip.", {
        align: "center",
        italics: true,
      });
    doc.text(`Generated: ${new Date().toLocaleString()}`, {
      align: "center",
      italics: true,
    });

    // Finalize PDF
    doc.end();
  } catch (err) {
    console.error("=== ERROR in generatePayslip ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to generate payslip",
      details: err.message,
    });
  }
};

// =====================================================
// GET PAYROLL HISTORY
// =====================================================
exports.getPayrollHistory = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found" });
    }

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

    let countQuery = `
      SELECT CAST(COUNT(*) AS INTEGER) as total 
      FROM payroll_records pr
      JOIN employees e ON pr.employee_id = e.id
      WHERE pr.company_id = $1
    `;
    const countParams = [companyId];

    if (employeeId > 0) {
      countQuery += ` AND pr.employee_id = $2`;
      countParams.push(employeeId);
    }

    const countResult = await db.query(countQuery, countParams);

    return res.json({
      data: result.rows,
      pagination: {
        page: page,
        per_page: perPage,
        total: countResult.rows[0].total,
        total_pages: Math.ceil(countResult.rows[0].total / perPage),
      },
    });
  } catch (err) {
    console.error("=== ERROR in getPayrollHistory ===");
    console.error(err);
    return res.status(500).json({
      error: "Failed to fetch payroll history",
      details: err.message,
    });
  }
};
