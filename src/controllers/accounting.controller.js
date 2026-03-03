// File: src/controllers/accounting.controller.js
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toNum(v) {
  return parseFloat(v) || 0;
}

// ── GET CHART OF ACCOUNTS ─────────────────────────────────────
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

// ── GET PAYROLL PERIODS ───────────────────────────────────────
exports.getPeriods = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, period_start, period_end, status
       FROM payroll_periods
       ORDER BY period_start DESC
       LIMIT 24`
    );
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET GL MAPPINGS ───────────────────────────────────────────
exports.getMappings = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        pgm.payroll_item_type,
        d.code as debit_code,  d.name as debit_name,
        c.code as credit_code, c.name as credit_name,
        dept.name as department,
        pgm.is_default
      FROM payroll_gl_mappings pgm
      LEFT JOIN chart_of_accounts d  ON pgm.debit_account_id  = d.id
      LEFT JOIN chart_of_accounts c  ON pgm.credit_account_id = c.id
      LEFT JOIN departments dept     ON pgm.department_id      = dept.id
      ORDER BY pgm.payroll_item_type
    `);
    res.json({ success: true, count: result.rows.length, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GENERATE JOURNAL ENTRY ────────────────────────────────────
exports.generateJournal = async (req, res) => {
  const { payroll_period_id, type = "standard", property_id } = req.body;

  if (!payroll_period_id) {
    return res
      .status(400)
      .json({ success: false, error: "payroll_period_id is required" });
  }
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

    let payrollQuery = `
      SELECT
        pr.gross_salary, pr.paye_tax, pr.pension_employee, pr.uif_employee, pr.net_salary,
        d.code as dept_code, d.name as dept_name,
        p.id as property_id, p.name as property_name
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

    let totalGross = 0,
      totalTax = 0,
      totalPension = 0,
      totalUIF = 0,
      totalNet = 0;
    const deptBreakdown = {};

    payrollData.rows.forEach((row) => {
      totalGross += toNum(row.gross_salary);
      totalTax += toNum(row.paye_tax);
      totalPension += toNum(row.pension_employee);
      totalUIF += toNum(row.uif_employee);
      totalNet += toNum(row.net_salary);

      const dept = row.dept_code || "GENERAL";
      if (!deptBreakdown[dept])
        deptBreakdown[dept] = {
          name: row.dept_name || "General",
          gross: 0,
          count: 0,
        };
      deptBreakdown[dept].gross += toNum(row.gross_salary);
      deptBreakdown[dept].count += 1;
    });

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

    if (type === "hospitality") {
      const tipsResult = await pool.query(
        `SELECT
          COALESCE(SUM(tips_cash), 0) as total_tips_cash,
          COALESCE(SUM(tips_card), 0) as total_tips_card
         FROM employee_shifts
         WHERE shift_date BETWEEN $1 AND $2
         ${
           property_id
             ? "AND employee_id IN (SELECT employee_id FROM employee_properties WHERE property_id = $3)"
             : ""
         }`,
        property_id
          ? [period.period_start, period.period_end, property_id]
          : [period.period_start, period.period_end]
      );

      const serviceChargeResult = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total_service_charge
         FROM tip_pools
         WHERE pool_type = 'service_charge'
         AND period_start >= $1 AND period_end <= $2
         ${property_id ? "AND property_id = $3" : ""}`,
        property_id
          ? [period.period_start, period.period_end, property_id]
          : [period.period_start, period.period_end]
      );

      const totalTipsCash = toNum(tipsResult.rows[0].total_tips_cash);
      const totalTipsCard = toNum(tipsResult.rows[0].total_tips_card);
      const totalServiceCharge = toNum(
        serviceChargeResult.rows[0].total_service_charge
      );

      if (totalTipsCash > 0)
        journalLines.push({
          line: 6,
          account_code: "6210",
          account_name: "Tips Collected - Cash",
          debit: 0,
          credit: totalTipsCash,
          category: "hospitality",
        });
      if (totalTipsCard > 0)
        journalLines.push({
          line: 7,
          account_code: "6215",
          account_name: "Tips Collected - Card",
          debit: 0,
          credit: totalTipsCard,
          category: "hospitality",
        });
      if (totalServiceCharge > 0)
        journalLines.push({
          line: 8,
          account_code: "6200",
          account_name: "Service Charges Collected",
          debit: 0,
          credit: totalServiceCharge,
          category: "hospitality",
        });

      hospitalityData = {
        tips_cash: totalTipsCash,
        tips_card: totalTipsCard,
        service_charge: totalServiceCharge,
        total_hospitality_liabilities:
          totalTipsCash + totalTipsCard + totalServiceCharge,
      };
      totalCredits += totalTipsCash + totalTipsCard + totalServiceCharge;
    }

    res.json({
      success: true,
      data: {
        journal_id: `JE-${type.toUpperCase()}-${payroll_period_id}`,
        date: new Date().toISOString().split("T")[0],
        period_start: period.period_start,
        period_end: period.period_end,
        reference: `PAYROLL-${type.toUpperCase()}-${payroll_period_id}`,
        type,
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
    });
  } catch (err) {
    console.error("generateJournal error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── EXPORT JOURNAL ────────────────────────────────────────────
exports.exportJournal = async (req, res) => {
  const { format, payroll_period_id, type = "standard" } = req.query;
  try {
    const result = await pool.query(
      `SELECT
        pp.period_start, pp.period_end,
        SUM(pr.gross_salary)       as total_gross,
        SUM(pr.paye_tax)           as total_tax,
        SUM(pr.pension_employee)   as total_pension,
        SUM(pr.uif_employee)       as total_uif,
        SUM(pr.net_salary)         as total_net
       FROM payroll_records pr
       JOIN payroll_periods pp ON pr.payroll_period_id = pp.id
       WHERE pp.id = $1
       GROUP BY pp.period_start, pp.period_end`,
      [payroll_period_id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ success: false, error: "No data found" });

    const row = result.rows[0];
    if (format === "csv") {
      const date = row.period_end.toISOString().split("T")[0];
      const ref = `PAYROLL-${type}-${payroll_period_id}`;
      let csv = "Date,Reference,Account Code,Account Name,Debit,Credit\n";
      csv += `${date},${ref},6100,Salaries & Wages,${row.total_gross},0\n`;
      csv += `${date},${ref},2100,SARS PAYE Liability,0,${row.total_tax}\n`;
      csv += `${date},${ref},2110,Pension Liability,0,${row.total_pension}\n`;
      csv += `${date},${ref},2130,UIF Liability,0,${row.total_uif}\n`;
      csv += `${date},${ref},2150,Net Salaries Payable,0,${row.total_net}\n`;
      if (type === "hospitality") {
        csv += `${date},${ref},6210,Tips Collected - Cash,0,0\n`;
        csv += `${date},${ref},6215,Tips Collected - Card,0,0\n`;
        csv += `${date},${ref},6200,Service Charges Collected,0,0\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${ref}.csv`);
      return res.send(csv);
    }
    return res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET P&L REPORT ────────────────────────────────────────────
exports.getPL = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { from, to, property_id } = req.query;
    if (!from || !to)
      return res.status(400).json({ error: "from and to dates are required" });

    const revenueParams = [companyId, from, to];
    let propertyFilter = "";
    if (property_id) {
      revenueParams.push(property_id);
      propertyFilter = ` AND property_id = $${revenueParams.length}`;
    }

    const revenue = await pool.query(
      `SELECT
        COALESCE(SUM(rooms_revenue),  0) as rooms,
        COALESCE(SUM(fb_revenue),     0) as fb,
        COALESCE(SUM(spa_revenue),    0) as spa,
        COALESCE(SUM(events_revenue), 0) as events,
        COALESCE(SUM(other_revenue),  0) as other,
        COALESCE(SUM(total_revenue),  0) as total,
        COALESCE(SUM(total_vat),      0) as vat,
        COALESCE(AVG(occupancy_rate), 0) as avg_occupancy
       FROM daily_revenue
       WHERE company_id = $1 AND revenue_date BETWEEN $2 AND $3 ${propertyFilter}`,
      revenueParams
    );

    const costs = await pool.query(
      `SELECT
        category,
        COALESCE(SUM(subtotal),     0) as subtotal,
        COALESCE(SUM(vat_amount),   0) as vat,
        COALESCE(SUM(total_amount), 0) as total
       FROM ap_invoices
       WHERE company_id = $1 AND invoice_date BETWEEN $2 AND $3 AND status != 'cancelled'
       GROUP BY category`,
      [companyId, from, to]
    );

    const payroll = await pool.query(
      `SELECT
        COALESCE(SUM(gross_pay), 0) as gross_payroll,
        COALESCE(SUM(net_pay),   0) as net_payroll,
        COALESCE(SUM(tax),       0) as paye,
        COALESCE(SUM(uif),       0) as uif
       FROM payroll_records
       WHERE company_id = $1
         AND (MAKE_DATE(year, month, 1) BETWEEN $2::date AND $3::date)
         AND status IN ('processed','paid')`,
      [companyId, from, to]
    );

    const rev = revenue.rows[0];
    const totalCosts = costs.rows.reduce((sum, r) => sum + toNum(r.total), 0);
    const payrollCost = toNum(payroll.rows[0]?.gross_payroll);
    const totalExpenses = totalCosts + payrollCost;
    const grossProfit = toNum(rev.total) - totalCosts;
    const netProfit = toNum(rev.total) - totalExpenses;
    const profitMargin =
      toNum(rev.total) > 0 ? (netProfit / toNum(rev.total)) * 100 : 0;

    return res.json({
      success: true,
      data: {
        period: { from, to },
        revenue: {
          rooms: toNum(rev.rooms),
          fb: toNum(rev.fb),
          spa: toNum(rev.spa),
          events: toNum(rev.events),
          other: toNum(rev.other),
          total: toNum(rev.total),
          vat: toNum(rev.vat),
          avg_occupancy: toNum(rev.avg_occupancy),
        },
        costs: {
          by_category: costs.rows,
          total_supplier_costs: totalCosts,
          payroll: {
            gross: payrollCost,
            net: toNum(payroll.rows[0]?.net_payroll),
            paye: toNum(payroll.rows[0]?.paye),
            uif: toNum(payroll.rows[0]?.uif),
          },
          total: totalExpenses,
        },
        summary: {
          gross_profit: grossProfit,
          net_profit: netProfit,
          profit_margin: parseFloat(profitMargin.toFixed(2)),
          is_profitable: netProfit > 0,
        },
      },
    });
  } catch (err) {
    console.error("getPL error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET VAT RETURN ────────────────────────────────────────────
exports.getVATReturn = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { month, year } = req.query;
    if (!month || !year)
      return res.status(400).json({ error: "month and year are required" });

    const m = parseInt(month);
    const y = parseInt(year);

    const output = await pool.query(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(gross_amount),0) as gross,
              COALESCE(SUM(vat_amount),0) as vat, COALESCE(SUM(net_amount),0) as net
       FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'output'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );

    const input = await pool.query(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(gross_amount),0) as gross,
              COALESCE(SUM(vat_amount),0) as vat, COALESCE(SUM(net_amount),0) as net
       FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'input'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );

    // Fallback: pull directly from invoices if vat_transactions is empty
    const invoiceVat = await pool.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM invoices
       WHERE company_id = $1 AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR FROM invoice_date) = $3 AND status IN ('paid','partial','sent')`,
      [companyId, m, y]
    );

    const apVat = await pool.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM ap_invoices
       WHERE company_id = $1 AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR FROM invoice_date) = $3 AND status != 'cancelled'`,
      [companyId, m, y]
    );

    const outputVat =
      toNum(output.rows[0].vat) || toNum(invoiceVat.rows[0].vat);
    const inputVat = toNum(input.rows[0].vat) || toNum(apVat.rows[0].vat);
    const vatPayable = outputVat - inputVat;

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return res.json({
      success: true,
      data: {
        period: { month: m, year: y, label: `${monthNames[m - 1]} ${y}` },
        output_vat: {
          gross: toNum(output.rows[0].gross),
          vat: outputVat,
          net: toNum(output.rows[0].net),
          transaction_count: parseInt(output.rows[0].transaction_count),
        },
        input_vat: {
          gross: toNum(input.rows[0].gross),
          vat: inputVat,
          net: toNum(input.rows[0].net),
          transaction_count: parseInt(input.rows[0].transaction_count),
        },
        summary: {
          output_vat: outputVat,
          input_vat: inputVat,
          vat_payable: vatPayable > 0 ? vatPayable : 0,
          vat_refundable: vatPayable < 0 ? Math.abs(vatPayable) : 0,
          is_refund: vatPayable < 0,
          vat_rate: 15,
        },
      },
    });
  } catch (err) {
    console.error("getVATReturn error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET VAT TRANSACTIONS ──────────────────────────────────────
exports.getVATTransactions = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { type, month, year } = req.query;

    let query = `SELECT * FROM vat_transactions WHERE company_id = $1`;
    const params = [companyId];
    let idx = 1;

    if (type) {
      idx++;
      query += ` AND transaction_type = $${idx}`;
      params.push(type);
    }
    if (month) {
      idx++;
      query += ` AND vat_period_month = $${idx}`;
      params.push(parseInt(month));
    }
    if (year) {
      idx++;
      query += ` AND vat_period_year = $${idx}`;
      params.push(parseInt(year));
    }

    query += ` ORDER BY transaction_date DESC`;
    const result = await pool.query(query, params);
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
