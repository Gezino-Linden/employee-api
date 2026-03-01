const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/accounting/accounts
exports.getAccounts = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, code, name, account_type FROM chart_of_accounts WHERE is_active = true ORDER BY code"
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/accounting/journal/generate - HANDLES BOTH STANDARD AND HOSPITALITY
exports.generateJournal = async (req, res) => {
  const { payroll_period_id, type = "standard", property_id } = req.body;

  if (!payroll_period_id) {
    return res
      .status(400)
      .json({ success: false, error: "payroll_period_id is required" });
  }

  // Validate type
  if (!["standard", "hospitality"].includes(type)) {
    return res
      .status(400)
      .json({
        success: false,
        error: 'type must be "standard" or "hospitality"',
      });
  }

  try {
    const periodCheck = await pool.query(
      "SELECT id, period_start, period_end FROM payroll_periods WHERE id = $1",
      [payroll_period_id]
    );

    if (periodCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Payroll period not found" });
    }

    const period = periodCheck.rows[0];

    // Get payroll data with optional property filter
    let payrollQuery = `
            SELECT 
                pr.gross_salary,
                pr.paye_tax,
                pr.pension_employee,
                pr.uif_employee,
                pr.net_salary,
                d.code as dept_code,
                d.name as dept_name,
                p.id as property_id,
                p.name as property_name
            FROM payroll_records pr
            JOIN employees e ON pr.employee_id = e.id
            LEFT JOIN departments d ON UPPER(e.department) = d.code
            LEFT JOIN employee_properties ep ON e.id = ep.employee_id AND ep.is_primary = true
            LEFT JOIN properties p ON ep.property_id = p.id
            WHERE pr.payroll_period_id = $1
        `;

    const queryParams = [payroll_period_id];

    if (property_id) {
      payrollQuery += ` AND p.id = $2`;
      queryParams.push(property_id);
    }

    const payrollData = await pool.query(payrollQuery, queryParams);

    if (payrollData.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "No payroll data found" });
    }

    // Calculate standard totals
    let totalGross = 0,
      totalTax = 0,
      totalPension = 0,
      totalUIF = 0,
      totalNet = 0;
    const deptBreakdown = {};

    payrollData.rows.forEach((row) => {
      totalGross += parseFloat(row.gross_salary) || 0;
      totalTax += parseFloat(row.paye_tax) || 0;
      totalPension += parseFloat(row.pension_employee) || 0;
      totalUIF += parseFloat(row.uif_employee) || 0;
      totalNet += parseFloat(row.net_salary) || 0;

      // Department breakdown
      const dept = row.dept_code || "GENERAL";
      if (!deptBreakdown[dept]) {
        deptBreakdown[dept] = {
          name: row.dept_name || "General",
          gross: 0,
          count: 0,
        };
      }
      deptBreakdown[dept].gross += parseFloat(row.gross_salary) || 0;
      deptBreakdown[dept].count += 1;
    });

    // Build base journal lines (standard)
    const journalLines = [
      {
        line: 1,
        account_code: "6100",
        account_name: "Salaries & Wages",
        debit: totalGross,
        credit: 0,
        category: "payroll",
      },
      {
        line: 2,
        account_code: "2100",
        account_name: "SARS PAYE Liability",
        debit: 0,
        credit: totalTax,
        category: "payroll",
      },
      {
        line: 3,
        account_code: "2110",
        account_name: "Pension Liability",
        debit: 0,
        credit: totalPension,
        category: "payroll",
      },
      {
        line: 4,
        account_code: "2130",
        account_name: "UIF Liability",
        debit: 0,
        credit: totalUIF,
        category: "payroll",
      },
      {
        line: 5,
        account_code: "2150",
        account_name: "Net Salaries Payable",
        debit: 0,
        credit: totalNet,
        category: "payroll",
      },
    ];

    let hospitalityData = null;
    let totalCredits = totalTax + totalPension + totalUIF + totalNet;

    // IF HOSPITALITY: Add tips and service charges
    if (type === "hospitality") {
      // Get tips from shifts
      const tipsResult = await pool.query(
        `
                SELECT 
                    COALESCE(SUM(tips_cash), 0) as total_tips_cash,
                    COALESCE(SUM(tips_card), 0) as total_tips_card
                FROM employee_shifts
                WHERE shift_date BETWEEN $1 AND $2
                ${
                  property_id
                    ? "AND employee_id IN (SELECT employee_id FROM employee_properties WHERE property_id = $3)"
                    : ""
                }
            `,
        property_id
          ? [period.period_start, period.period_end, property_id]
          : [period.period_start, period.period_end]
      );

      const totalTipsCash = parseFloat(tipsResult.rows[0].total_tips_cash) || 0;
      const totalTipsCard = parseFloat(tipsResult.rows[0].total_tips_card) || 0;

      // Get service charges
      const serviceChargeResult = await pool.query(
        `
                SELECT COALESCE(SUM(total_amount), 0) as total_service_charge
                FROM tip_pools
                WHERE pool_type = 'service_charge'
                AND period_start >= $1 AND period_end <= $2
                ${property_id ? "AND property_id = $3" : ""}
            `,
        property_id
          ? [period.period_start, period.period_end, property_id]
          : [period.period_start, period.period_end]
      );

      const totalServiceCharge =
        parseFloat(serviceChargeResult.rows[0].total_service_charge) || 0;

      // Add hospitality lines
      if (totalTipsCash > 0) {
        journalLines.push({
          line: 6,
          account_code: "6210",
          account_name: "Tips Collected - Cash",
          debit: 0,
          credit: totalTipsCash,
          category: "hospitality",
        });
      }
      if (totalTipsCard > 0) {
        journalLines.push({
          line: 7,
          account_code: "6215",
          account_name: "Tips Collected - Card",
          debit: 0,
          credit: totalTipsCard,
          category: "hospitality",
        });
      }
      if (totalServiceCharge > 0) {
        journalLines.push({
          line: 8,
          account_code: "6200",
          account_name: "Service Charges Collected",
          debit: 0,
          credit: totalServiceCharge,
          category: "hospitality",
        });
      }

      hospitalityData = {
        tips_cash: totalTipsCash,
        tips_card: totalTipsCard,
        service_charge: totalServiceCharge,
        total_hospitality_liabilities:
          totalTipsCash + totalTipsCard + totalServiceCharge,
      };

      totalCredits += totalTipsCash + totalTipsCard + totalServiceCharge;
    }

    // Build response
    const response = {
      success: true,
      data: {
        journal_id: `JE-${type.toUpperCase()}-${payroll_period_id}`,
        date: new Date().toISOString().split("T")[0],
        period_start: period.period_start,
        period_end: period.period_end,
        reference: `PAYROLL-${type.toUpperCase()}-${payroll_period_id}`,
        type: type,
        property_id: property_id || null,
        total_debits: totalGross,
        total_credits: totalCredits,
        is_balanced: Math.abs(totalGross - totalCredits) < 0.01,
        summary: {
          payroll: {
            gross: totalGross,
            tax: totalTax,
            pension: totalPension,
            uif: totalUIF,
            net: totalNet,
          },
          ...(hospitalityData && { hospitality: hospitalityData }),
        },
        department_breakdown: deptBreakdown,
        lines: journalLines,
      },
    };

    res.json(response);
  } catch (err) {
    console.error("Journal generation error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/accounting/export/:format
exports.exportJournal = async (req, res) => {
  const { format, payroll_period_id, type = "standard" } = req.query;

  try {
    const result = await pool.query(
      `
            SELECT 
                pp.period_start,
                pp.period_end,
                SUM(pr.gross_salary) as total_gross,
                SUM(pr.paye_tax) as total_tax,
                SUM(pr.pension_employee) as total_pension,
                SUM(pr.uif_employee) as total_uif,
                SUM(pr.net_salary) as total_net
            FROM payroll_records pr
            JOIN payroll_periods pp ON pr.payroll_period_id = pp.id
            WHERE pp.id = $1
            GROUP BY pp.period_start, pp.period_end
        `,
      [payroll_period_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "No data found" });
    }

    const row = result.rows[0];

    if (format === "csv") {
      let csv = "Date,Reference,Account Code,Account Name,Debit,Credit\n";
      const date = row.period_end.toISOString().split("T")[0];
      const ref = `PAYROLL-${type}-${payroll_period_id}`;

      // Standard lines
      csv += `${date},${ref},6100,Salaries & Wages,${row.total_gross},0\n`;
      csv += `${date},${ref},2100,SARS PAYE Liability,0,${row.total_tax}\n`;
      csv += `${date},${ref},2110,Pension Liability,0,${row.total_pension}\n`;
      csv += `${date},${ref},2130,UIF Liability,0,${row.total_uif}\n`;
      csv += `${date},${ref},2150,Net Salaries Payable,0,${row.total_net}\n`;

      // Hospitality lines
      if (type === "hospitality") {
        csv += `${date},${ref},6210,Tips Collected - Cash,0,0\n`;
        csv += `${date},${ref},6215,Tips Collected - Card,0,0\n`;
        csv += `${date},${ref},6200,Service Charges Collected,0,0\n`;
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${ref}.csv`);
      res.send(csv);
    } else {
      res.json({ success: true, data: result.rows[0] });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/accounting/mappings
exports.getMappings = async (req, res) => {
  try {
    const result = await pool.query(`
            SELECT 
                pgm.payroll_item_type,
                d.code as debit_code,
                d.name as debit_name,
                c.code as credit_code,
                c.name as credit_name,
                dept.name as department,
                pgm.is_default
            FROM payroll_gl_mappings pgm
            LEFT JOIN chart_of_accounts d ON pgm.debit_account_id = d.id
            LEFT JOIN chart_of_accounts c ON pgm.credit_account_id = c.id
            LEFT JOIN departments dept ON pgm.department_id = dept.id
            ORDER BY pgm.payroll_item_type
        `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
