// File: src/controllers/ap.controller.js
const cache = require("../utils/cache");
const { VAT, CACHE_TTL } = require("../config/constants");
const db = require("../db");

function toNum(v) {
  return parseFloat(v) || 0;
}

// ── GET SUPPLIERS ─────────────────────────────────────────────
exports.getSuppliers = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { search, category, active = "true" } = req.query;

    const isDefaultQuery = !search && !category && active === "true";
    const cacheKey = `suppliers:${companyId}`;

    if (isDefaultQuery) {
      const cached = cache.get(cacheKey);
      if (cached)
        return res.json({ data: cached, count: cached.length, cached: true });
    }

    let query = `SELECT * FROM ap_suppliers WHERE company_id = $1`;
    const params = [companyId];
    let idx = 1;

    if (active !== "all") {
      idx++;
      query += ` AND is_active = $${idx}`;
      params.push(active === "true");
    }
    if (category) {
      idx++;
      query += ` AND category = $${idx}`;
      params.push(category);
    }
    if (search) {
      idx++;
      query += ` AND name ILIKE $${idx}`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY name`;
    const result = await db.query(query, params);

    if (isDefaultQuery) cache.set(cacheKey, result.rows, CACHE_TTL.SUPPLIERS);

    return res.json({ data: result.rows, count: result.rows.length });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch suppliers", details: err.message });
  }
};

// ── CREATE SUPPLIER ───────────────────────────────────────────
exports.createSupplier = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const {
      name,
      contact_name,
      email,
      phone,
      address,
      vat_number,
      bank_name,
      bank_account,
      bank_branch,
      category = "general",
      payment_terms = 30,
    } = req.body;

    if (!name)
      return res.status(400).json({ error: "Supplier name is required" });

    const result = await db.query(
      `INSERT INTO ap_suppliers
        (company_id, name, contact_name, email, phone, address, vat_number,
         bank_name, bank_account, bank_branch, category, payment_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        companyId,
        name,
        contact_name,
        email,
        phone,
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_branch,
        category,
        payment_terms,
      ]
    );

    cache.del(`suppliers:${companyId}`);
    return res
      .status(201)
      .json({ message: "Supplier created", supplier: result.rows[0] });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to create supplier", details: err.message });
  }
};

// ── UPDATE SUPPLIER ───────────────────────────────────────────
exports.updateSupplier = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;
    const {
      name,
      contact_name,
      email,
      phone,
      address,
      vat_number,
      bank_name,
      bank_account,
      bank_branch,
      category,
      payment_terms,
      is_active,
    } = req.body;

    const result = await db.query(
      `UPDATE ap_suppliers SET
        name = COALESCE($1, name), contact_name = COALESCE($2, contact_name),
        email = COALESCE($3, email), phone = COALESCE($4, phone),
        address = COALESCE($5, address), vat_number = COALESCE($6, vat_number),
        bank_name = COALESCE($7, bank_name), bank_account = COALESCE($8, bank_account),
        bank_branch = COALESCE($9, bank_branch), category = COALESCE($10, category),
        payment_terms = COALESCE($11, payment_terms), is_active = COALESCE($12, is_active),
        updated_at = NOW()
       WHERE id = $13 AND company_id = $14 RETURNING *`,
      [
        name,
        contact_name,
        email,
        phone,
        address,
        vat_number,
        bank_name,
        bank_account,
        bank_branch,
        category,
        payment_terms,
        is_active,
        id,
        companyId,
      ]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Supplier not found" });

    cache.del(`suppliers:${companyId}`);
    return res.json({ message: "Supplier updated", supplier: result.rows[0] });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to update supplier", details: err.message });
  }
};

// ── GET BILLS ─────────────────────────────────────────────────
exports.getBills = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const {
      status,
      supplier_id,
      from,
      to,
      page = 1,
      per_page = 50,
    } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    let query = `
      SELECT ai.*, s.name as supplier_name, s.category as supplier_category
      FROM ap_invoices ai
      JOIN ap_suppliers s ON ai.supplier_id = s.id
      WHERE ai.company_id = $1
    `;
    const params = [companyId];
    let idx = 1;

    if (status) {
      idx++;
      query += ` AND ai.status = $${idx}`;
      params.push(status);
    }
    if (supplier_id) {
      idx++;
      query += ` AND ai.supplier_id = $${idx}`;
      params.push(supplier_id);
    }
    if (from) {
      idx++;
      query += ` AND ai.invoice_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      query += ` AND ai.invoice_date <= $${idx}`;
      params.push(to);
    }

    query += ` ORDER BY ai.created_at DESC LIMIT $${++idx} OFFSET $${++idx}`;
    params.push(parseInt(per_page), offset);

    const result = await db.query(query, params);
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM ap_invoices WHERE company_id = $1`,
      [companyId]
    );

    return res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        per_page: parseInt(per_page),
        total: parseInt(countResult.rows[0].total),
      },
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch bills", details: err.message });
  }
};

// ── CREATE BILL ───────────────────────────────────────────────
exports.createBill = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const {
      supplier_id,
      supplier_invoice_no,
      description,
      category = "general",
      invoice_date,
      due_date,
      subtotal,
      vat_amount = 0,
      gl_account,
      notes,
    } = req.body;

    if (!supplier_id || !description || !invoice_date || !subtotal)
      return res
        .status(400)
        .json({
          error:
            "supplier_id, description, invoice_date and subtotal are required",
        });

    const sup = await db.query(
      `SELECT id FROM ap_suppliers WHERE id = $1 AND company_id = $2`,
      [supplier_id, companyId]
    );
    if (sup.rows.length === 0)
      return res.status(404).json({ error: "Supplier not found" });

    await client.query("BEGIN");

    const sub = toNum(subtotal);
    const vat = toNum(vat_amount);
    const total = sub + vat;

    const result = await client.query(
      `INSERT INTO ap_invoices
        (company_id, supplier_id, supplier_invoice_no, description, category,
         invoice_date, due_date, subtotal, vat_amount, total_amount, balance_due,
         gl_account, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13) RETURNING *`,
      [
        companyId,
        supplier_id,
        supplier_invoice_no,
        description,
        category,
        invoice_date,
        due_date,
        sub,
        vat,
        total,
        gl_account,
        notes,
        req.user.id,
      ]
    );

    // Auto-create input VAT transaction — VAT.RATE passed as JS param $5
    if (vat > 0) {
      const d = new Date(invoice_date);
      await client.query(
        `INSERT INTO vat_transactions
          (company_id, transaction_type, source_type, source_id, transaction_date,
           gross_amount, vat_rate, vat_amount, net_amount, description,
           vat_period_month, vat_period_year)
         VALUES ($1,'input','ap_invoice',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          companyId,
          result.rows[0].id,
          d,
          total,
          VAT.RATE,
          vat,
          sub,
          `Bill: ${description}`,
          d.getMonth() + 1,
          d.getFullYear(),
        ]
      );
    }

    await client.query("COMMIT");
    return res
      .status(201)
      .json({ message: "Bill created", bill: result.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("createBill error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create bill", details: err.message });
  } finally {
    client.release();
  }
};

// ── PAY BILL ──────────────────────────────────────────────────
exports.payBill = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;
    const { payment_date, payment_method, payment_reference, amount } =
      req.body;

    if (!payment_method)
      return res.status(400).json({ error: "payment_method is required" });

    const bill = await db.query(
      `SELECT * FROM ap_invoices WHERE id = $1 AND company_id = $2`,
      [id, companyId]
    );
    if (bill.rows.length === 0)
      return res.status(404).json({ error: "Bill not found" });
    if (bill.rows[0].status === "paid")
      return res.status(409).json({ error: "Bill already paid" });

    await client.query("BEGIN");

    const paid = toNum(amount) || toNum(bill.rows[0].balance_due);
    const totalPaid = toNum(bill.rows[0].amount_paid) + paid;
    const balance = Math.max(0, toNum(bill.rows[0].total_amount) - totalPaid);
    const newStatus = balance <= 0 ? "paid" : "pending";
    const pDate = payment_date
      ? new Date(payment_date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const result = await client.query(
      `UPDATE ap_invoices SET
        status = $1, amount_paid = $2, balance_due = $3,
        payment_date = $4, payment_method = $5, payment_reference = $6, updated_at = NOW()
       WHERE id = $7 AND company_id = $8 RETURNING *`,
      [
        newStatus,
        totalPaid,
        balance,
        pDate,
        payment_method,
        payment_reference,
        id,
        companyId,
      ]
    );

    const updatedBill = result.rows[0];

    // Post cost to daily_revenue so P&L picks it up automatically
    if (newStatus === "paid") {
      try {
        await client.query(
          `INSERT INTO daily_revenue
             (company_id, property_id, revenue_date,
              rooms_revenue, fb_revenue, spa_revenue, events_revenue, other_revenue,
              total_revenue, total_vat, rooms_available, rooms_occupied, occupancy_rate,
              total_costs, notes, status, recorded_by)
           VALUES ($1, NULL, $2, 0,0,0,0,0, 0,0, 0,0,0, $3, $4, 'approved', $5)
           ON CONFLICT (company_id, revenue_date, property_id)
           DO UPDATE SET
             total_costs = daily_revenue.total_costs + EXCLUDED.total_costs,
             updated_at  = NOW()`,
          [
            companyId,
            pDate,
            toNum(updatedBill.total_amount),
            `Auto: Bill payment ${updatedBill.supplier_invoice_no || id}`,
            req.user.id,
          ]
        );
      } catch (costErr) {
        console.warn("daily_revenue cost post skipped:", costErr.message);
      }
    }

    await client.query("COMMIT");
    return res.json({
      message: "Bill payment recorded",
      bill: updatedBill,
      cost_posted: newStatus === "paid",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return res
      .status(500)
      .json({ error: "Failed to pay bill", details: err.message });
  } finally {
    client.release();
  }
};

// ── AP SUMMARY ────────────────────────────────────────────────
exports.getAPSummary = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const result = await db.query(
      `SELECT
        COUNT(*)                                                    as total_bills,
        COUNT(CASE WHEN status = 'pending'   THEN 1 END)           as pending,
        COUNT(CASE WHEN status = 'approved'  THEN 1 END)           as approved,
        COUNT(CASE WHEN status = 'paid'      THEN 1 END)           as paid,
        COALESCE(SUM(total_amount),  0)                            as total_billed,
        COALESCE(SUM(amount_paid),   0)                            as total_paid,
        COALESCE(SUM(balance_due),   0)                            as total_outstanding,
        COALESCE(SUM(vat_amount),    0)                            as total_input_vat,
        COUNT(CASE WHEN due_date < CURRENT_DATE AND status != 'paid' THEN 1 END) as overdue
       FROM ap_invoices WHERE company_id = $1`,
      [companyId]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch AP summary", details: err.message });
  }
};
// ── AP AGEING REPORT ───────────────────────────────────────────
exports.getAPAgeing = async (req, res) => {
  try {
    const companyId = req.user?.company_id;

    // ── 1. Invoice buckets ───────────────────────────────────────────────────
    const result = await db.query(
      `SELECT
         s.name                                                          AS supplier_name,
         COUNT(i.id)::int                                                AS invoice_count,
         COALESCE(SUM(CASE WHEN i.due_date >= CURRENT_DATE
                           THEN i.balance_due ELSE 0 END), 0)           AS current_due,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE
                            AND i.due_date >= CURRENT_DATE - 30
                           THEN i.balance_due ELSE 0 END), 0)           AS days_1_30,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 30
                            AND i.due_date >= CURRENT_DATE - 60
                           THEN i.balance_due ELSE 0 END), 0)           AS days_31_60,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 60
                            AND i.due_date >= CURRENT_DATE - 90
                           THEN i.balance_due ELSE 0 END), 0)           AS days_61_90,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 90
                            AND i.due_date >= CURRENT_DATE - 120
                           THEN i.balance_due ELSE 0 END), 0)           AS days_90_120,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 120
                            AND i.due_date >= CURRENT_DATE - 150
                           THEN i.balance_due ELSE 0 END), 0)           AS days_120_150,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 150
                            AND i.due_date >= CURRENT_DATE - 180
                           THEN i.balance_due ELSE 0 END), 0)           AS days_150_180,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 180
                            AND i.due_date >= CURRENT_DATE - 210
                           THEN i.balance_due ELSE 0 END), 0)           AS days_180_210,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 210
                            AND i.due_date >= CURRENT_DATE - 240
                           THEN i.balance_due ELSE 0 END), 0)           AS days_210_240,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 240
                            AND i.due_date >= CURRENT_DATE - 270
                           THEN i.balance_due ELSE 0 END), 0)           AS days_240_270,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 270
                            AND i.due_date >= CURRENT_DATE - 300
                           THEN i.balance_due ELSE 0 END), 0)           AS days_270_300,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 300
                            AND i.due_date >= CURRENT_DATE - 330
                           THEN i.balance_due ELSE 0 END), 0)           AS days_300_330,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 330
                            AND i.due_date >= CURRENT_DATE - 360
                           THEN i.balance_due ELSE 0 END), 0)           AS days_330_360,
         COALESCE(SUM(CASE WHEN i.due_date <  CURRENT_DATE - 360
                           THEN i.balance_due ELSE 0 END), 0)           AS days_360_plus,
         COALESCE(SUM(i.balance_due), 0)                                AS total_outstanding
       FROM ap_invoices i
       JOIN ap_suppliers s ON s.id = i.supplier_id
       WHERE i.company_id = $1
         AND i.status != 'paid'
         AND i.balance_due > 0
       GROUP BY s.name
       ORDER BY total_outstanding DESC`,
      [companyId]
    );

    // ── 2. Opening balances ──────────────────────────────────────────────────
    const obResult = await db.query(
      `SELECT entity_name, SUM(amount) AS opening_balance
       FROM opening_balances
       WHERE company_id = $1 AND entity_type = 'supplier'
       GROUP BY entity_name`,
      [companyId]
    );
    const obMap = {};
    obResult.rows.forEach((r) => {
      obMap[r.entity_name] = toNum(r.opening_balance);
    });

    // ── 3. Build rows with running balances ──────────────────────────────────
    const suppliers = result.rows.map((r) => {
      const ob = obMap[r.supplier_name] || 0;
      const current = toNum(r.current_due);
      const d1_30 = toNum(r.days_1_30);
      const d31_60 = toNum(r.days_31_60);
      const d61_90 = toNum(r.days_61_90);
      const d90_120 = toNum(r.days_90_120);
      const d120_150 = toNum(r.days_120_150);
      const d150_180 = toNum(r.days_150_180);
      const d180_210 = toNum(r.days_180_210);
      const d210_240 = toNum(r.days_210_240);
      const d240_270 = toNum(r.days_240_270);
      const d270_300 = toNum(r.days_270_300);
      const d300_330 = toNum(r.days_300_330);
      const d330_360 = toNum(r.days_330_360);
      const d360_plus = toNum(r.days_360_plus);

      const invoiceTotal =
        current +
        d1_30 +
        d31_60 +
        d61_90 +
        d90_120 +
        d120_150 +
        d150_180 +
        d180_210 +
        d210_240 +
        d240_270 +
        d270_300 +
        d300_330 +
        d330_360 +
        d360_plus;

      const bal_360plus = ob + d360_plus;
      const bal_330_360 = bal_360plus + d330_360;
      const bal_300_330 = bal_330_360 + d300_330;
      const bal_270_300 = bal_300_330 + d270_300;
      const bal_240_270 = bal_270_300 + d240_270;
      const bal_210_240 = bal_240_270 + d210_240;
      const bal_180_210 = bal_210_240 + d180_210;
      const bal_150_180 = bal_180_210 + d150_180;
      const bal_120_150 = bal_150_180 + d120_150;
      const bal_90_120 = bal_120_150 + d90_120;
      const bal_61_90 = bal_90_120 + d61_90;
      const bal_31_60 = bal_61_90 + d31_60;
      const bal_1_30 = bal_31_60 + d1_30;
      const bal_current = bal_1_30 + current;

      return {
        supplier_name: r.supplier_name,
        invoice_count: r.invoice_count,
        opening_balance: ob,
        current_due: current,
        days_1_30: d1_30,
        days_31_60: d31_60,
        days_61_90: d61_90,
        days_90_120: d90_120,
        days_120_150: d120_150,
        days_150_180: d150_180,
        days_180_210: d180_210,
        days_210_240: d210_240,
        days_240_270: d240_270,
        days_270_300: d270_300,
        days_300_330: d300_330,
        days_330_360: d330_360,
        days_360_plus: d360_plus,
        total_outstanding: invoiceTotal + ob,
        balance_360plus: bal_360plus,
        balance_330_360: bal_330_360,
        balance_300_330: bal_300_330,
        balance_270_300: bal_270_300,
        balance_240_270: bal_240_270,
        balance_210_240: bal_210_240,
        balance_180_210: bal_180_210,
        balance_150_180: bal_150_180,
        balance_120_150: bal_120_150,
        balance_90_120: bal_90_120,
        balance_61_90: bal_61_90,
        balance_31_60: bal_31_60,
        balance_1_30: bal_1_30,
        balance_current: bal_current,
      };
    });

    // Add opening-balance-only suppliers
    for (const [name, ob] of Object.entries(obMap)) {
      if (!suppliers.find((s) => s.supplier_name === name)) {
        suppliers.push({
          supplier_name: name,
          invoice_count: 0,
          opening_balance: ob,
          current_due: 0,
          days_1_30: 0,
          days_31_60: 0,
          days_61_90: 0,
          days_90_120: 0,
          days_120_150: 0,
          days_150_180: 0,
          days_180_210: 0,
          days_210_240: 0,
          days_240_270: 0,
          days_270_300: 0,
          days_300_330: 0,
          days_330_360: 0,
          days_360_plus: 0,
          total_outstanding: ob,
          balance_360plus: ob,
          balance_330_360: ob,
          balance_300_330: ob,
          balance_270_300: ob,
          balance_240_270: ob,
          balance_210_240: ob,
          balance_180_210: ob,
          balance_150_180: ob,
          balance_120_150: ob,
          balance_90_120: ob,
          balance_61_90: ob,
          balance_31_60: ob,
          balance_1_30: ob,
          balance_current: ob,
        });
      }
    }

    suppliers.sort((a, b) => b.total_outstanding - a.total_outstanding);

    // ── 4. Totals ────────────────────────────────────────────────────────────
    const zeroTotals = {
      invoice_count: 0,
      opening_balance: 0,
      current_due: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_90_120: 0,
      days_120_150: 0,
      days_150_180: 0,
      days_180_210: 0,
      days_210_240: 0,
      days_240_270: 0,
      days_270_300: 0,
      days_300_330: 0,
      days_330_360: 0,
      days_360_plus: 0,
      total_outstanding: 0,
      balance_360plus: 0,
      balance_330_360: 0,
      balance_300_330: 0,
      balance_270_300: 0,
      balance_240_270: 0,
      balance_210_240: 0,
      balance_180_210: 0,
      balance_150_180: 0,
      balance_120_150: 0,
      balance_90_120: 0,
      balance_61_90: 0,
      balance_31_60: 0,
      balance_1_30: 0,
      balance_current: 0,
    };

    const totals = suppliers.reduce(
      (acc, r) => {
        for (const key of Object.keys(acc)) acc[key] += r[key] || 0;
        return acc;
      },
      { ...zeroTotals }
    );

    return res.json({
      as_of: new Date().toISOString().split("T")[0],
      suppliers,
      totals,
    });
  } catch (err) {
    console.error("ERROR in getAPAgeing:", err);
    return res
      .status(500)
      .json({
        error: "Failed to generate AP ageing report",
        details: err.message,
      });
  }
};