// File: src/controllers/emp201.controller.js
const db = require("../db");

// =====================================================
// HELPERS
// =====================================================
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatTaxPeriod(month) {
  return String(month).padStart(2, "0");
}

function calculateDueDate(year, month) {
  // Due date is 7th of following month
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-07`;
}

// =====================================================
// GENERATE EMP201
// Auto-generate EMP201 from payroll data
// =====================================================
exports.generateEMP201 = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    // Call database function to generate EMP201
    const result = await db.query(
      `SELECT generate_emp201($1, $2, $3) as declaration_id`,
      [companyId, month, year]
    );

    const declarationId = result.rows[0].declaration_id;

    // Fetch the created declaration
    const declaration = await db.query(
      `SELECT * FROM emp201_declarations WHERE id = $1`,
      [declarationId]
    );

    return res.json({
      message: "EMP201 declaration generated successfully",
      declaration: declaration.rows[0],
    });
  } catch (err) {
    console.error("ERROR in generateEMP201:", err);
    return res.status(500).json({
      error: "Failed to generate EMP201",
      details: err.message,
    });
  }
};

// =====================================================
// GET EMP201 DECLARATIONS
// List all declarations with filters
// =====================================================
exports.getEMP201Declarations = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = req.query.year || new Date().getFullYear();
    const status = req.query.status;

    let query = `
      SELECT 
        d.*,
        s.period_name,
        s.due_date,
        CASE 
          WHEN d.payment_status = 'paid' THEN 'paid'
          WHEN s.due_date < CURRENT_DATE AND d.payment_status != 'paid' THEN 'overdue'
          ELSE d.payment_status
        END as computed_payment_status
      FROM emp201_declarations d
      LEFT JOIN emp201_payment_schedule s 
        ON d.tax_year = s.tax_year AND d.tax_period = s.tax_period
      WHERE d.company_id = $1 AND d.tax_year = $2
    `;

    const params = [companyId, year.toString()];

    if (status) {
      query += ` AND d.submission_status = $3`;
      params.push(status);
    }

    query += ` ORDER BY d.tax_period DESC`;

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getEMP201Declarations:", err);
    return res.status(500).json({
      error: "Failed to fetch declarations",
      details: err.message,
    });
  }
};

// =====================================================
// GET SINGLE EMP201
// Get declaration with line items
// =====================================================
exports.getEMP201ById = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const declarationId = toInt(req.params.id, 0);

    if (!declarationId) {
      return res.status(400).json({ error: "Invalid declaration ID" });
    }

    // Get declaration
    const declaration = await db.query(
      `SELECT d.*, s.period_name, s.due_date
       FROM emp201_declarations d
       LEFT JOIN emp201_payment_schedule s 
         ON d.tax_year = s.tax_year AND d.tax_period = s.tax_period
       WHERE d.id = $1 AND d.company_id = $2`,
      [declarationId, companyId]
    );

    if (declaration.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    // Get line items
    const lineItems = await db.query(
      `SELECT * FROM emp201_line_items WHERE declaration_id = $1 ORDER BY employee_name`,
      [declarationId]
    );

    return res.json({
      declaration: declaration.rows[0],
      lineItems: lineItems.rows,
    });
  } catch (err) {
    console.error("ERROR in getEMP201ById:", err);
    return res.status(500).json({
      error: "Failed to fetch declaration",
      details: err.message,
    });
  }
};

// =====================================================
// UPDATE EMP201
// Update declaration details (notes, ETI, etc.)
// =====================================================
exports.updateEMP201 = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const declarationId = toInt(req.params.id, 0);
    const { eti_amount, notes } = req.body;

    if (!declarationId) {
      return res.status(400).json({ error: "Invalid declaration ID" });
    }

    // Verify ownership
    const check = await db.query(
      `SELECT id, paye_amount, sdl_amount, uif_total_amount 
       FROM emp201_declarations 
       WHERE id = $1 AND company_id = $2`,
      [declarationId, companyId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    const declaration = check.rows[0];

    // Recalculate total liability if ETI changed
    const newEtiAmount = eti_amount !== undefined ? eti_amount : 0;
    const newTotalLiability =
      parseFloat(declaration.paye_amount) +
      parseFloat(declaration.sdl_amount) +
      parseFloat(declaration.uif_total_amount) -
      newEtiAmount;

    const result = await db.query(
      `UPDATE emp201_declarations
       SET 
         eti_amount = COALESCE($1, eti_amount),
         total_liability = $2,
         notes = COALESCE($3, notes),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [eti_amount, newTotalLiability, notes, declarationId]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in updateEMP201:", err);
    return res.status(500).json({
      error: "Failed to update declaration",
      details: err.message,
    });
  }
};

// =====================================================
// SUBMIT TO SARS
// Mark as submitted (manual eFiling submission)
// =====================================================
exports.submitToSARS = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const declarationId = toInt(req.params.id, 0);
    const { submission_reference, sars_acknowledgement } = req.body;

    if (!declarationId) {
      return res.status(400).json({ error: "Invalid declaration ID" });
    }

    const result = await db.query(
      `UPDATE emp201_declarations
       SET 
         submission_status = 'submitted',
         submission_date = NOW(),
         submission_reference = $1,
         sars_acknowledgement = $2,
         submitted_by = $3,
         updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [
        submission_reference,
        sars_acknowledgement,
        req.user.id,
        declarationId,
        companyId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    return res.json({
      message: "Declaration marked as submitted to SARS",
      declaration: result.rows[0],
    });
  } catch (err) {
    console.error("ERROR in submitToSARS:", err);
    return res.status(500).json({
      error: "Failed to submit declaration",
      details: err.message,
    });
  }
};

// =====================================================
// MARK AS PAID
// Record payment to SARS
// =====================================================
exports.markAsPaid = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const declarationId = toInt(req.params.id, 0);
    const { payment_date, payment_reference, payment_amount } = req.body;

    if (!declarationId) {
      return res.status(400).json({ error: "Invalid declaration ID" });
    }

    if (!payment_date || !payment_reference) {
      return res.status(400).json({
        error: "Payment date and reference are required",
      });
    }

    const result = await db.query(
      `UPDATE emp201_declarations
       SET 
         payment_status = 'paid',
         payment_date = $1,
         payment_reference = $2,
         payment_amount = COALESCE($3, total_liability),
         updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [
        payment_date,
        payment_reference,
        payment_amount,
        declarationId,
        companyId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    return res.json({
      message: "Payment recorded successfully",
      declaration: result.rows[0],
    });
  } catch (err) {
    console.error("ERROR in markAsPaid:", err);
    return res.status(500).json({
      error: "Failed to record payment",
      details: err.message,
    });
  }
};

// =====================================================
// EXPORT CSV
// Generate CSV for SARS eFiling bulk upload
// =====================================================
exports.exportCSV = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const declarationId = toInt(req.params.id, 0);

    if (!declarationId) {
      return res.status(400).json({ error: "Invalid declaration ID" });
    }

    // Get declaration
    const declaration = await db.query(
      `SELECT * FROM emp201_declarations WHERE id = $1 AND company_id = $2`,
      [declarationId, companyId]
    );

    if (declaration.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    const dec = declaration.rows[0];

    // Generate CSV content
    const csv = `EMP201 Declaration
Tax Year,${dec.tax_year}
Tax Period,${dec.tax_period}
Period,${dec.period_start_date} to ${dec.period_end_date}

Employee Count,${dec.employee_count}
Total Remuneration,R ${parseFloat(dec.total_remuneration).toFixed(2)}

PAYE (Employees Tax),R ${parseFloat(dec.paye_amount).toFixed(2)}
SDL (Skills Development Levy),R ${parseFloat(dec.sdl_amount).toFixed(2)}
UIF Employee Contribution,R ${parseFloat(dec.uif_employee_amount).toFixed(2)}
UIF Employer Contribution,R ${parseFloat(dec.uif_employer_amount).toFixed(2)}
UIF Total,R ${parseFloat(dec.uif_total_amount).toFixed(2)}
ETI (Employment Tax Incentive),R ${parseFloat(dec.eti_amount).toFixed(2)}

TOTAL LIABILITY,R ${parseFloat(dec.total_liability).toFixed(2)}

Payment Status,${dec.payment_status}
Submission Status,${dec.submission_status}
`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="EMP201-${dec.tax_year}-${dec.tax_period}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    console.error("ERROR in exportCSV:", err);
    return res.status(500).json({
      error: "Failed to export CSV",
      details: err.message,
    });
  }
};

// =====================================================
// GET DASHBOARD SUMMARY
// Quick stats for compliance dashboard
// =====================================================
exports.getDashboardSummary = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = req.query.year || new Date().getFullYear();

    const result = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_declarations,
        CAST(COUNT(CASE WHEN submission_status = 'submitted' THEN 1 END) AS INTEGER) as submitted_count,
        CAST(COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) AS INTEGER) as paid_count,
        CAST(COUNT(CASE WHEN payment_status = 'overdue' THEN 1 END) AS INTEGER) as overdue_count,
        COALESCE(SUM(total_liability), 0) as total_liability_ytd,
        COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN payment_amount ELSE 0 END), 0) as total_paid_ytd,
        COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN total_liability ELSE 0 END), 0) as total_outstanding
       FROM emp201_declarations
       WHERE company_id = $1 AND tax_year = $2`,
      [companyId, year.toString()]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in getDashboardSummary:", err);
    return res.status(500).json({
      error: "Failed to fetch summary",
      details: err.message,
    });
  }
};

// =====================================================
// GET PAYMENT SCHEDULE
// View upcoming due dates
// =====================================================
exports.getPaymentSchedule = async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    const result = await db.query(
      `SELECT * FROM emp201_payment_schedule 
       WHERE tax_year = $1 
       ORDER BY tax_period`,
      [year.toString()]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getPaymentSchedule:", err);
    return res.status(500).json({
      error: "Failed to fetch schedule",
      details: err.message,
    });
  }
};
