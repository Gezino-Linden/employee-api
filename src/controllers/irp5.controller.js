// File: src/controllers/irp5.controller.js
const db = require("../db");

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatMoney(val) {
  return Number(val || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getTaxYearLabel(year) {
  return `1 March ${year - 1} – 28 February ${year}`;
}

// =====================================================
// GENERATE IRP5 CERTIFICATES
// =====================================================
exports.generate = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { tax_year } = req.body;
    if (!tax_year)
      return res
        .status(400)
        .json({ error: "tax_year is required (e.g. 2026)" });

    const result = await db.query(
      `SELECT generate_irp5_certificates($1, $2) AS cert_count`,
      [companyId, tax_year]
    );

    const certCount = result.rows[0].cert_count;

    return res.json({
      message: `Generated ${certCount} IRP5 certificates for tax year ${tax_year}`,
      cert_count: certCount,
      tax_year,
    });
  } catch (err) {
    console.error("ERROR in generate IRP5:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate IRP5", details: err.message });
  }
};

// =====================================================
// GET ALL CERTIFICATES FOR A TAX YEAR
// =====================================================
exports.getCertificates = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const taxYear = req.query.tax_year || new Date().getFullYear();

    const result = await db.query(
      `SELECT c.*, e.department, e.position
       FROM irp5_certificates c
       JOIN employees e ON e.id = c.employee_id
       WHERE c.company_id = $1 AND c.tax_year = $2
       ORDER BY c.employee_name`,
      [companyId, taxYear.toString()]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getCertificates:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch certificates", details: err.message });
  }
};

// =====================================================
// GET SINGLE CERTIFICATE
// =====================================================
exports.getCertificateById = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const result = await db.query(
      `SELECT c.*, e.department, e.position
       FROM irp5_certificates c
       JOIN employees e ON e.id = c.employee_id
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in getCertificateById:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch certificate", details: err.message });
  }
};

// =====================================================
// GET IT3(a) RECONCILIATION
// =====================================================
exports.getReconciliation = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const taxYear = req.query.tax_year || new Date().getFullYear();

    const result = await db.query(
      `SELECT * FROM irp5_reconciliation
       WHERE company_id = $1 AND tax_year = $2`,
      [companyId, taxYear.toString()]
    );

    return res.json(result.rows[0] || null);
  } catch (err) {
    console.error("ERROR in getReconciliation:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch reconciliation", details: err.message });
  }
};

// =====================================================
// MARK AS ISSUED
// =====================================================
exports.issueAll = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { tax_year } = req.body;
    if (!tax_year)
      return res.status(400).json({ error: "tax_year is required" });

    const result = await db.query(
      `UPDATE irp5_certificates
       SET generation_status = 'issued', issued_date = NOW(), issued_by = $1, updated_at = NOW()
       WHERE company_id = $2 AND tax_year = $3
       RETURNING id`,
      [req.user.id, companyId, tax_year.toString()]
    );

    return res.json({
      message: `Issued ${result.rows.length} certificates`,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("ERROR in issueAll:", err);
    return res
      .status(500)
      .json({ error: "Failed to issue certificates", details: err.message });
  }
};

// =====================================================
// EXPORT CSV FOR SARS e@syFile
// =====================================================
exports.exportCSV = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const taxYear = req.query.tax_year || new Date().getFullYear();

    const certs = await db.query(
      `SELECT * FROM irp5_certificates
       WHERE company_id = $1 AND tax_year = $2
       ORDER BY employee_name`,
      [companyId, taxYear.toString()]
    );

    if (certs.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No certificates found for this tax year" });
    }

    let csv = `IRP5/IT3(a) Tax Certificates - Tax Year ${taxYear}\n`;
    csv += `Period,${getTaxYearLabel(parseInt(taxYear))}\n`;
    csv += `Generated,${new Date().toLocaleDateString("en-ZA")}\n\n`;

    csv += `Certificate No,Employee Name,ID Number,Tax Number,UIF Number,`;
    csv += `Code 3601 (Salary),Code 4101 (PAYE),Code 4141 (UIF Emp),Code 4142 (UIF Er),Code 4149 (SDL),`;
    csv += `Total Remuneration,Total Deductions,Net Pay,Months Employed,Status\n`;

    for (const c of certs.rows) {
      csv += `${c.certificate_number},`;
      csv += `${c.employee_name},`;
      csv += `${c.employee_id_number || ""},`;
      csv += `${c.employee_tax_number || ""},`;
      csv += `${c.employee_uif_number || ""},`;
      csv += `${parseFloat(c.code_3601).toFixed(2)},`;
      csv += `${parseFloat(c.code_4101).toFixed(2)},`;
      csv += `${parseFloat(c.code_4141).toFixed(2)},`;
      csv += `${parseFloat(c.code_4142).toFixed(2)},`;
      csv += `${parseFloat(c.code_4149).toFixed(2)},`;
      csv += `${parseFloat(c.total_remuneration).toFixed(2)},`;
      csv += `${parseFloat(c.total_deductions).toFixed(2)},`;
      csv += `${parseFloat(c.net_pay).toFixed(2)},`;
      csv += `${c.months_employed},`;
      csv += `${c.generation_status}\n`;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="IRP5-${taxYear}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    console.error("ERROR in exportCSV IRP5:", err);
    return res
      .status(500)
      .json({ error: "Failed to export", details: err.message });
  }
};

// =====================================================
// GENERATE PDF - Single IRP5 certificate as HTML
// (Frontend renders and prints - no server-side PDF lib needed)
// =====================================================
exports.getCertificateHTML = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "Invalid ID" });

    const result = await db.query(
      `SELECT c.*, e.department, e.position, co.name AS company_name
       FROM irp5_certificates c
       JOIN employees e ON e.id = c.employee_id
       JOIN companies co ON co.id = c.company_id
       WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Certificate not found" });
    }

    const c = result.rows[0];
    const taxYearLabel = getTaxYearLabel(parseInt(c.tax_year));

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>IRP5 - ${c.employee_name} - ${c.tax_year}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a2e; padding: 20px; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a1a2e; padding-bottom: 12px; margin-bottom: 16px; }
    .header-left h1 { font-size: 22px; font-weight: 900; color: #1a1a2e; letter-spacing: 2px; }
    .header-left p { font-size: 11px; color: #555; margin-top: 2px; }
    .cert-badge { background: #1a1a2e; color: white; padding: 6px 14px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-align: center; }
    .cert-number { font-size: 9px; color: #888; margin-top: 4px; text-align: center; }
    .section { margin-bottom: 14px; }
    .section-title { background: #1a1a2e; color: white; padding: 5px 10px; font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .info-row { display: flex; justify-content: space-between; padding: 4px 8px; background: #f8f9fa; border-left: 2px solid #e2e8f0; }
    .info-label { color: #666; font-size: 10px; }
    .info-value { font-weight: 600; font-size: 10px; }
    .codes-table { width: 100%; border-collapse: collapse; }
    .codes-table th { background: #f1f5f9; padding: 6px 10px; text-align: left; font-size: 10px; font-weight: 700; border: 1px solid #e2e8f0; }
    .codes-table td { padding: 6px 10px; border: 1px solid #e2e8f0; font-size: 11px; }
    .codes-table tr:nth-child(even) { background: #f8fafc; }
    .code-badge { background: #1a1a2e; color: white; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; }
    .amount { font-weight: 700; text-align: right; font-family: 'Courier New', monospace; }
    .income { color: #059669; }
    .deduction { color: #dc2626; }
    .total-row { background: #1a1a2e !important; color: white; }
    .total-row td { color: white; font-weight: 700; font-size: 12px; }
    .net-row { background: #059669 !important; }
    .net-row td { color: white; font-weight: 700; font-size: 13px; }
    .footer { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; }
    .footer-note { font-size: 9px; color: #888; max-width: 60%; }
    .signature-box { border: 1px solid #ccc; padding: 8px 20px; text-align: center; font-size: 9px; color: #888; }
    .watermark { color: #10b981; font-weight: 700; font-size: 10px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>IRP5</h1>
      <p>Employee Tax Certificate — ${taxYearLabel}</p>
      <p style="margin-top:4px; color:#555;">Issued by: <strong>${
        c.company_name
      }</strong></p>
    </div>
    <div>
      <div class="cert-badge">TAX CERTIFICATE</div>
      <div class="cert-number">${c.certificate_number}</div>
      <div style="margin-top:6px; font-size:9px; color:#888; text-align:center;">
        Status: <span class="watermark">${c.generation_status.toUpperCase()}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Employee Information</div>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Full Name</span>
        <span class="info-value">${c.employee_name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Department</span>
        <span class="info-value">${c.department || "—"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">ID Number</span>
        <span class="info-value">${c.employee_id_number || "—"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tax Number</span>
        <span class="info-value">${c.employee_tax_number || "—"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">UIF Number</span>
        <span class="info-value">${c.employee_uif_number || "—"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Months Employed</span>
        <span class="info-value">${c.months_employed}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Income &amp; Deductions — SARS Codes</div>
    <table class="codes-table">
      <thead>
        <tr>
          <th>SARS Code</th>
          <th>Description</th>
          <th style="text-align:right;">Amount (ZAR)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="code-badge">3601</span></td>
          <td>Salary / Wages (Income)</td>
          <td class="amount income">R ${formatMoney(c.code_3601)}</td>
        </tr>
        <tr>
          <td><span class="code-badge">4101</span></td>
          <td>Employees Tax (PAYE) Withheld</td>
          <td class="amount deduction">R ${formatMoney(c.code_4101)}</td>
        </tr>
        <tr>
          <td><span class="code-badge">4141</span></td>
          <td>UIF — Employee Contribution (1%)</td>
          <td class="amount deduction">R ${formatMoney(c.code_4141)}</td>
        </tr>
        <tr>
          <td><span class="code-badge">4142</span></td>
          <td>UIF — Employer Contribution (1%)</td>
          <td class="amount deduction">R ${formatMoney(c.code_4142)}</td>
        </tr>
        <tr>
          <td><span class="code-badge">4149</span></td>
          <td>Skills Development Levy (SDL 1%)</td>
          <td class="amount deduction">R ${formatMoney(c.code_4149)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="2"><strong>TOTAL REMUNERATION (Gross)</strong></td>
          <td class="amount">R ${formatMoney(c.total_remuneration)}</td>
        </tr>
        <tr style="background:#fef2f2;">
          <td colspan="2" style="color:#dc2626; font-weight:700;">TOTAL DEDUCTIONS</td>
          <td class="amount deduction">R ${formatMoney(c.total_deductions)}</td>
        </tr>
        <tr class="net-row">
          <td colspan="2"><strong>NET PAY (Take Home)</strong></td>
          <td class="amount">R ${formatMoney(c.net_pay)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="footer">
    <div class="footer-note">
      This IRP5 certificate is issued in terms of the Income Tax Act No. 58 of 1962.
      This certificate must be submitted with your annual income tax return (ITR12).
      Tax year: ${taxYearLabel}.
      Certificate generated: ${new Date().toLocaleDateString("en-ZA")}.
    </div>
    <div class="signature-box">
      <div style="margin-bottom:20px;">________________________</div>
      <div>Authorised Signatory</div>
      <div>${c.company_name}</div>
    </div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    console.error("ERROR in getCertificateHTML:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate certificate", details: err.message });
  }
};
