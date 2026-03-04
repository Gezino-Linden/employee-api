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
