// File: src/controllers/ui19.controller.js
const db = require("../db");

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// =====================================================
// GENERATE UI-19
// =====================================================
exports.generate = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ error: "Month and year are required" });
    }

    const result = await db.query(
      `SELECT generate_ui19($1, $2, $3) AS declaration_id`,
      [companyId, month, year]
    );

    const declarationId = result.rows[0].declaration_id;

    const declaration = await db.query(
      `SELECT * FROM ui19_declarations WHERE id = $1`,
      [declarationId]
    );

    return res.json({
      message: "UI-19 declaration generated successfully",
      declaration: declaration.rows[0],
    });
  } catch (err) {
    console.error("ERROR in generate UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate UI-19", details: err.message });
  }
};

// =====================================================
// GET ALL DECLARATIONS
// =====================================================
exports.getDeclarations = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = req.query.year || new Date().getFullYear();

    const result = await db.query(
      `SELECT * FROM ui19_declarations
       WHERE company_id = $1 AND year = $2
       ORDER BY month DESC`,
      [companyId, year]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getDeclarations UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch declarations", details: err.message });
  }
};

// =====================================================
// GET SINGLE DECLARATION WITH LINE ITEMS
// =====================================================
exports.getById = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const declaration = await db.query(
      `SELECT * FROM ui19_declarations WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    if (declaration.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    const lineItems = await db.query(
      `SELECT * FROM ui19_line_items WHERE declaration_id = $1 ORDER BY employee_name`,
      [id]
    );

    return res.json({
      declaration: declaration.rows[0],
      lineItems: lineItems.rows,
    });
  } catch (err) {
    console.error("ERROR in getById UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch declaration", details: err.message });
  }
};

// =====================================================
// SUBMIT UI-19
// =====================================================
exports.submit = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    const { submission_reference, notes } = req.body;

    if (!id) return res.status(400).json({ error: "Invalid ID" });
    if (!submission_reference)
      return res
        .status(400)
        .json({ error: "Submission reference is required" });

    const result = await db.query(
      `UPDATE ui19_declarations
       SET submission_status = 'submitted',
           submission_date = NOW(),
           submission_reference = $1,
           submitted_by = $2,
           notes = COALESCE($3, notes),
           updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING *`,
      [submission_reference, req.user.id, notes, id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    return res.json({
      message: "UI-19 marked as submitted to Department of Labour",
      declaration: result.rows[0],
    });
  } catch (err) {
    console.error("ERROR in submit UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to submit", details: err.message });
  }
};

// =====================================================
// EXPORT CSV
// =====================================================
exports.exportCSV = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const declaration = await db.query(
      `SELECT * FROM ui19_declarations WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );

    if (declaration.rows.length === 0) {
      return res.status(404).json({ error: "Declaration not found" });
    }

    const lineItems = await db.query(
      `SELECT * FROM ui19_line_items WHERE declaration_id = $1 ORDER BY employee_name`,
      [id]
    );

    const dec = declaration.rows[0];
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const periodName = `${months[dec.month - 1]} ${dec.year}`;

    // Header rows
    let csv = `UI-19 UIF Declaration\n`;
    csv += `Period,${periodName}\n`;
    csv += `Generated,${new Date().toLocaleDateString("en-ZA")}\n`;
    csv += `Employee Count,${dec.employee_count}\n`;
    csv += `Total Remuneration,R ${parseFloat(dec.total_remuneration).toFixed(
      2
    )}\n`;
    csv += `Total UIF Employee,R ${parseFloat(dec.total_uif_employee).toFixed(
      2
    )}\n`;
    csv += `Total UIF Employer,R ${parseFloat(dec.total_uif_employer).toFixed(
      2
    )}\n`;
    csv += `Total UIF,R ${parseFloat(dec.total_uif).toFixed(2)}\n`;
    csv += `\n`;

    // Column headers
    csv += `Employee Name,ID Number,UIF Number,Gross Remuneration,UIF Employee (1%),UIF Employer (1%),Total UIF,Days Worked,Reason Code\n`;

    // Data rows
    for (const item of lineItems.rows) {
      csv += `${item.employee_name},`;
      csv += `${item.id_number || ""},`;
      csv += `${item.uif_number || ""},`;
      csv += `${parseFloat(item.gross_remuneration).toFixed(2)},`;
      csv += `${parseFloat(item.uif_employee).toFixed(2)},`;
      csv += `${parseFloat(item.uif_employer).toFixed(2)},`;
      csv += `${parseFloat(item.total_uif).toFixed(2)},`;
      csv += `${item.days_worked},`;
      csv += `${item.reason_code}\n`;
    }

    // Totals row
    csv += `TOTAL,,,,`;
    csv += `${parseFloat(dec.total_uif_employee).toFixed(2)},`;
    csv += `${parseFloat(dec.total_uif_employer).toFixed(2)},`;
    csv += `${parseFloat(dec.total_uif).toFixed(2)},,\n`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="UI19-${dec.year}-${String(dec.month).padStart(
        2,
        "0"
      )}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    console.error("ERROR in exportCSV UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to export", details: err.message });
  }
};

// =====================================================
// UPDATE LINE ITEM (UIF number, days worked)
// =====================================================
exports.updateLineItem = async (req, res) => {
  try {
    const id = toInt(req.params.id, 0);
    const { uif_number, days_worked, reason_code } = req.body;
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const result = await db.query(
      `UPDATE ui19_line_items
       SET uif_number  = COALESCE($1, uif_number),
           days_worked = COALESCE($2, days_worked),
           reason_code = COALESCE($3, reason_code)
       WHERE id = $4
       RETURNING *`,
      [uif_number, days_worked, reason_code, id]
    );

    // Also update uif_number on employee record
    if (uif_number && result.rows.length > 0) {
      await db.query(`UPDATE employees SET uif_number = $1 WHERE id = $2`, [
        uif_number,
        result.rows[0].employee_id,
      ]);
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in updateLineItem UI-19:", err);
    return res
      .status(500)
      .json({ error: "Failed to update", details: err.message });
  }
};
