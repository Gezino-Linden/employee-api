// File: src/controllers/accounting.controller.js
const db = require("../db");
const cache = require("../utils/cache");
const {
  VAT,
  GL_ACCOUNTS,
  CACHE_TTL,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
} = require("../config/constants");

function toNum(v) {
  return parseFloat(v) || 0;
}

// ── GET CHART OF ACCOUNTS ─────────────────────────────────────
exports.getAccounts = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const cacheKey = `accounts:${companyId}`;
    const cached = cache.get(cacheKey);
    if (cached)
      return res.json({
        success: true,
        count: cached.length,
        data: cached,
        cached: true,
      });

    const result = await db.query(
      "SELECT id, code, name, account_type FROM chart_of_accounts WHERE is_active = true ORDER BY code"
    );

    cache.set(cacheKey, result.rows, CACHE_TTL.ACCOUNTS);
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET PAYROLL PERIODS ───────────────────────────────────────
exports.getPeriods = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
         id,
         MAKE_DATE(year, month, 1)                     AS period_start,
         (MAKE_DATE(year, month, 1)
           + INTERVAL '1 month - 1 day')::date         AS period_end,
         status,
         total_employees,
         total_gross
       FROM payroll_periods
       ORDER BY year DESC, month DESC
       LIMIT 24`
    );
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GET GL MAPPINGS ───────────────────────────────────────────
exports.getMappings = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const cacheKey = `mappings:${companyId}`;
    const cached = cache.get(cacheKey);
    if (cached)
      return res.json({
        success: true,
        count: cached.length,
        data: cached,
        cached: true,
      });

    const result = await db.query(`
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

    cache.set(cacheKey, result.rows, CACHE_TTL.MAPPINGS);
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── GENERATE JOURNAL ENTRY ────────────────────────────────────
exports.generateJournal = async (req, res) => {
  const { payroll_period_id, type = "standard", property_id } = req.body;

  if (!payroll_period_id)
    return res
      .status(400)
      .json({ success: false, error: "payroll_period_id is required" });
  if (!["standard", "hospitality"].includes(type))
    return res
      .status(400)
      .json({
        success: false,
        error: 'type must be "standard" or "hospitality"',
      });

  try {
    const periodCheck = await db.query(
      "SELECT id, period_start, period_end FROM payroll_periods WHERE id = $1",
      [payroll_period_id]
    );
    if (periodCheck.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "Payroll period not found" });

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

    const payrollData = await db.query(payrollQuery, queryParams);
    if (payrollData.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, error: "No payroll data found" });

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
        account_code: GL_ACCOUNTS.SALARIES_WAGES,
        account_name: "Salaries & Wages",
        debit: totalGross,
        credit: 0,
        category: "payroll",
      },
      {
        line: 2,
        account_code: GL_ACCOUNTS.SARS_PAYE_LIABILITY,
        account_name: "SARS PAYE Liability",
        debit: 0,
        credit: totalTax,
        category: "payroll",
      },
      {
        line: 3,
        account_code: GL_ACCOUNTS.PENSION_LIABILITY,
        account_name: "Pension Liability",
        debit: 0,
        credit: totalPension,
        category: "payroll",
      },
      {
        line: 4,
        account_code: GL_ACCOUNTS.UIF_LIABILITY,
        account_name: "UIF Liability",
        debit: 0,
        credit: totalUIF,
        category: "payroll",
      },
      {
        line: 5,
        account_code: GL_ACCOUNTS.NET_SALARIES_PAYABLE,
        account_name: "Net Salaries Payable",
        debit: 0,
        credit: totalNet,
        category: "payroll",
      },
    ];

    let hospitalityData = null;
    let totalCredits = totalTax + totalPension + totalUIF + totalNet;

    if (type === "hospitality") {
      const tipsResult = await db.query(
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

      const serviceChargeResult = await db.query(
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
          account_code: GL_ACCOUNTS.TIPS_CASH,
          account_name: "Tips Collected - Cash",
          debit: 0,
          credit: totalTipsCash,
          category: "hospitality",
        });
      if (totalTipsCard > 0)
        journalLines.push({
          line: 7,
          account_code: GL_ACCOUNTS.TIPS_CARD,
          account_name: "Tips Collected - Card",
          debit: 0,
          credit: totalTipsCard,
          category: "hospitality",
        });
      if (totalServiceCharge > 0)
        journalLines.push({
          line: 8,
          account_code: GL_ACCOUNTS.SERVICE_CHARGES,
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

    return res.json({
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
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── EXPORT JOURNAL ────────────────────────────────────────────
exports.exportJournal = async (req, res) => {
  const { format, payroll_period_id, type = "standard" } = req.query;
  try {
    const result = await db.query(
      `SELECT
        pp.period_start, pp.period_end,
        SUM(pr.gross_salary)     as total_gross,
        SUM(pr.paye_tax)         as total_tax,
        SUM(pr.pension_employee) as total_pension,
        SUM(pr.uif_employee)     as total_uif,
        SUM(pr.net_salary)       as total_net
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
      csv += `${date},${ref},${GL_ACCOUNTS.SALARIES_WAGES},Salaries & Wages,${row.total_gross},0\n`;
      csv += `${date},${ref},${GL_ACCOUNTS.SARS_PAYE_LIABILITY},SARS PAYE Liability,0,${row.total_tax}\n`;
      csv += `${date},${ref},${GL_ACCOUNTS.PENSION_LIABILITY},Pension Liability,0,${row.total_pension}\n`;
      csv += `${date},${ref},${GL_ACCOUNTS.UIF_LIABILITY},UIF Liability,0,${row.total_uif}\n`;
      csv += `${date},${ref},${GL_ACCOUNTS.NET_SALARIES_PAYABLE},Net Salaries Payable,0,${row.total_net}\n`;
      if (type === "hospitality") {
        csv += `${date},${ref},${GL_ACCOUNTS.TIPS_CASH},Tips Collected - Cash,0,0\n`;
        csv += `${date},${ref},${GL_ACCOUNTS.TIPS_CARD},Tips Collected - Card,0,0\n`;
        csv += `${date},${ref},${GL_ACCOUNTS.SERVICE_CHARGES},Service Charges Collected,0,0\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${ref}.csv`);
      return res.send(csv);
    }
    return res.json({ success: true, data: row });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
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

    const revenue = await db.query(
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

    const costs = await db.query(
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

    const payroll = await db.query(
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
    return res.status(500).json({ success: false, error: err.message });
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

    const output = await db.query(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(gross_amount),0) as gross,
              COALESCE(SUM(vat_amount),0) as vat, COALESCE(SUM(net_amount),0) as net
       FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'output'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );

    const input = await db.query(
      `SELECT COUNT(*) as transaction_count, COALESCE(SUM(gross_amount),0) as gross,
              COALESCE(SUM(vat_amount),0) as vat, COALESCE(SUM(net_amount),0) as net
       FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'input'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );

    const invoiceVat = await db.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM invoices
       WHERE company_id = $1 AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR FROM invoice_date) = $3 AND status IN ('paid','partial','sent')`,
      [companyId, m, y]
    );

    const apVat = await db.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM ap_invoices
       WHERE company_id = $1 AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR FROM invoice_date) = $3 AND status != 'cancelled'`,
      [companyId, m, y]
    );

    const outputVat =
      toNum(output.rows[0].vat) || toNum(invoiceVat.rows[0].vat);
    const inputVat = toNum(input.rows[0].vat) || toNum(apVat.rows[0].vat);
    const vatPayable = outputVat - inputVat;

    return res.json({
      success: true,
      data: {
        period: { month: m, year: y, label: `${MONTH_NAMES[m - 1]} ${y}` },
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
          vat_rate: VAT.RATE,
        },
      },
    });
  } catch (err) {
    console.error("getVATReturn error:", err);
    return res.status(500).json({ success: false, error: err.message });
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
      query += ` AND vat_period_year  = $${idx}`;
      params.push(parseInt(year));
    }

    query += ` ORDER BY transaction_date DESC`;
    const result = await db.query(query, params);
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ── CLOSE MONTH-END PERIOD ────────────────────────────────────
exports.closePeriod = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const { month, year } = req.body;

    if (!month || !year)
      return res.status(400).json({ error: "month and year are required" });

    const m = parseInt(month);
    const y = parseInt(year);

    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id, status FROM accounting_periods
       WHERE company_id = $1 AND period_month = $2 AND period_year = $3`,
      [companyId, m, y]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === "closed") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: `Period ${month}/${year} is already closed`,
        period_id: existing.rows[0].id,
      });
    }

    const outputVat = await client.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'output'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );
    const inputVat = await client.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM vat_transactions
       WHERE company_id = $1 AND transaction_type = 'input'
         AND vat_period_month = $2 AND vat_period_year = $3`,
      [companyId, m, y]
    );
    const invVat = await client.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM invoices
       WHERE company_id = $1
         AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR  FROM invoice_date) = $3
         AND status IN ('paid','partial','sent')`,
      [companyId, m, y]
    );
    const apVat = await client.query(
      `SELECT COALESCE(SUM(vat_amount), 0) as vat FROM ap_invoices
       WHERE company_id = $1
         AND EXTRACT(MONTH FROM invoice_date) = $2
         AND EXTRACT(YEAR  FROM invoice_date) = $3
         AND status != 'cancelled'`,
      [companyId, m, y]
    );

    const finalOutputVat =
      toNum(outputVat.rows[0].vat) || toNum(invVat.rows[0].vat);
    const finalInputVat =
      toNum(inputVat.rows[0].vat) || toNum(apVat.rows[0].vat);
    const vatPayable = finalOutputVat - finalInputVat;

    const revenue = await client.query(
      `SELECT
         COALESCE(SUM(total_revenue), 0) as total_revenue,
         COALESCE(SUM(total_costs),   0) as total_costs,
         COALESCE(SUM(total_vat),     0) as total_vat,
         COALESCE(AVG(occupancy_rate),0) as avg_occupancy
       FROM daily_revenue
       WHERE company_id = $1
         AND EXTRACT(MONTH FROM revenue_date) = $2
         AND EXTRACT(YEAR  FROM revenue_date) = $3`,
      [companyId, m, y]
    );

    const payroll = await client.query(
      `SELECT
         COALESCE(SUM(gross_pay), 0) as gross,
         COALESCE(SUM(net_pay),   0) as net,
         COALESCE(SUM(tax),       0) as paye,
         COALESCE(SUM(uif),       0) as uif
       FROM payroll_records
       WHERE company_id = $1 AND month = $2 AND year = $3
         AND status IN ('processed','paid')`,
      [companyId, m, y]
    );

    const period = await client.query(
      `INSERT INTO accounting_periods
         (company_id, period_month, period_year, status,
          total_revenue, total_costs, payroll_cost,
          output_vat, input_vat, vat_payable,
          avg_occupancy, closed_by, closed_at)
       VALUES ($1,$2,$3,'closed',$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (company_id, period_month, period_year)
       DO UPDATE SET
         status        = 'closed',
         total_revenue = EXCLUDED.total_revenue,
         total_costs   = EXCLUDED.total_costs,
         payroll_cost  = EXCLUDED.payroll_cost,
         output_vat    = EXCLUDED.output_vat,
         input_vat     = EXCLUDED.input_vat,
         vat_payable   = EXCLUDED.vat_payable,
         avg_occupancy = EXCLUDED.avg_occupancy,
         closed_by     = EXCLUDED.closed_by,
         closed_at     = NOW()
       RETURNING *`,
      [
        companyId,
        m,
        y,
        toNum(revenue.rows[0].total_revenue),
        toNum(revenue.rows[0].total_costs),
        toNum(payroll.rows[0].gross),
        finalOutputVat,
        finalInputVat,
        vatPayable > 0 ? vatPayable : 0,
        toNum(revenue.rows[0].avg_occupancy),
        req.user.id,
      ]
    );

    await client.query(
      `UPDATE daily_revenue
       SET status = 'locked', updated_at = NOW()
       WHERE company_id = $1
         AND EXTRACT(MONTH FROM revenue_date) = $2
         AND EXTRACT(YEAR  FROM revenue_date) = $3`,
      [companyId, m, y]
    );

    if (vatPayable > 0) {
      try {
        await client.query(
          `INSERT INTO gl_journal_lines
             (company_id, journal_date, reference, account_code, account_name,
              debit, credit, category, source_type, source_id, created_by)
           VALUES
             ($1,NOW(),$2,$3,'VAT Control Account', $5, 0,  'vat','period_close',$6,$7),
             ($1,NOW(),$2,$4,'SARS VAT Payable',     0, $5, 'vat','period_close',$6,$7)`,
          [
            companyId,
            `VAT-CLOSE-${MONTH_NAMES_SHORT[m - 1]}-${y}`,
            GL_ACCOUNTS.VAT_CONTROL,
            GL_ACCOUNTS.SARS_VAT_PAYABLE,
            vatPayable,
            period.rows[0].id,
            req.user.id,
          ]
        );
      } catch (glErr) {
        console.warn("VAT GL journal skipped:", glErr.message);
      }
    }

    cache.del(`accounts:${companyId}`);
    cache.del(`mappings:${companyId}`);

    await client.query("COMMIT");

    return res.json({
      success: true,
      message: `Period ${month}/${year} closed successfully`,
      period: period.rows[0],
      summary: {
        total_revenue: toNum(revenue.rows[0].total_revenue),
        total_costs: toNum(revenue.rows[0].total_costs),
        payroll_cost: toNum(payroll.rows[0].gross),
        output_vat: finalOutputVat,
        input_vat: finalInputVat,
        vat_payable: vatPayable > 0 ? vatPayable : 0,
        vat_refundable: vatPayable < 0 ? Math.abs(vatPayable) : 0,
        avg_occupancy: toNum(revenue.rows[0].avg_occupancy),
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("closePeriod error:", err);
    return res
      .status(500)
      .json({ error: "Failed to close period", details: err.message });
  } finally {
    client.release();
  }
};

// ── CHECK PERIOD STATUS ───────────────────────────────────────
exports.getPeriodStatus = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { month, year } = req.query;
    if (!month || !year)
      return res.status(400).json({ error: "month and year are required" });

    const result = await db.query(
      `SELECT * FROM accounting_periods
       WHERE company_id = $1 AND period_month = $2 AND period_year = $3`,
      [companyId, parseInt(month), parseInt(year)]
    );

    if (result.rows.length === 0) return res.json({ status: "open" });
    return res.json(result.rows[0]);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to check period status", details: err.message });
  }
};
