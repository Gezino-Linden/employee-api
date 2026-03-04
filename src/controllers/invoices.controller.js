// File: src/controllers/invoices.controller.js
const cache = require("../utils/cache");
const db = require("../db");

// ── HELPERS ──────────────────────────────────────────────────
function toNum(v) {
  return parseFloat(v) || 0;
}

async function generateInvoiceNumber(companyId) {
  const result = await db.query(`SELECT nextval('invoice_number_seq') as seq`);
  const seq = result.rows[0].seq;
  return `INV-${companyId}-${seq}`;
}

async function recalcInvoice(client, invoiceId) {
  await client.query(
    `
    UPDATE invoices i
    SET
      subtotal     = COALESCE((SELECT SUM(line_total / (1 + vat_rate/100)) FROM invoice_line_items WHERE invoice_id = i.id), 0),
      vat_amount   = COALESCE((SELECT SUM(vat_amount)  FROM invoice_line_items WHERE invoice_id = i.id), 0),
      total_amount = COALESCE((SELECT SUM(line_total)  FROM invoice_line_items WHERE invoice_id = i.id), 0),
      balance_due  = COALESCE((SELECT SUM(line_total)  FROM invoice_line_items WHERE invoice_id = i.id), 0) - amount_paid,
      updated_at   = NOW()
    WHERE id = $1
  `,
    [invoiceId]
  );
}

// ── GET ALL INVOICES ──────────────────────────────────────────
exports.getInvoices = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const { status, from, to, search, page = 1, per_page = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    let query = `
      SELECT i.*, p.name as property_name
      FROM invoices i
      LEFT JOIN properties p ON i.property_id = p.id
      WHERE i.company_id = $1
    `;
    const params = [companyId];
    let idx = 1;

    if (status) {
      idx++;
      query += ` AND i.status = $${idx}`;
      params.push(status);
    }
    if (from) {
      idx++;
      query += ` AND i.invoice_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      query += ` AND i.invoice_date <= $${idx}`;
      params.push(to);
    }
    if (search) {
      idx++;
      query += ` AND (i.guest_name ILIKE $${idx} OR i.invoice_number ILIKE $${idx} OR i.company_name ILIKE $${idx})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${++idx} OFFSET $${++idx}`;
    params.push(parseInt(per_page), offset);

    const result = await db.query(query, params);

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM invoices WHERE company_id = $1`,
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
    console.error("getInvoices error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch invoices", details: err.message });
  }
};

// ── GET SINGLE INVOICE ────────────────────────────────────────
exports.getInvoice = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;

    const invoice = await db.query(
      `SELECT i.*, p.name as property_name
       FROM invoices i
       LEFT JOIN properties p ON i.property_id = p.id
       WHERE i.id = $1 AND i.company_id = $2`,
      [id, companyId]
    );
    if (invoice.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });

    const lines = await db.query(
      `SELECT il.*, rc.name as category_name, rc.code as category_code
       FROM invoice_line_items il
       LEFT JOIN revenue_categories rc ON il.category_id = rc.id
       WHERE il.invoice_id = $1 ORDER BY il.id`,
      [id]
    );

    const payments = await db.query(
      `SELECT * FROM ar_payments WHERE invoice_id = $1 ORDER BY payment_date DESC`,
      [id]
    );

    return res.json({
      ...invoice.rows[0],
      line_items: lines.rows,
      payments: payments.rows,
    });
  } catch (err) {
    console.error("getInvoice error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch invoice", details: err.message });
  }
};

// ── CREATE INVOICE ────────────────────────────────────────────
exports.createInvoice = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const {
      guest_name,
      guest_email,
      guest_phone,
      company_name,
      invoice_type = "guest",
      invoice_date,
      due_date,
      check_in_date,
      check_out_date,
      property_id,
      notes,
      line_items = [],
    } = req.body;

    if (!guest_name)
      return res.status(400).json({ error: "guest_name is required" });

    await client.query("BEGIN");

    const invoiceNumber = await generateInvoiceNumber(companyId);

    const inv = await client.query(
      `INSERT INTO invoices
        (company_id, invoice_number, invoice_type, guest_name, guest_email, guest_phone,
         company_name, invoice_date, due_date, check_in_date, check_out_date,
         property_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        companyId,
        invoiceNumber,
        invoice_type,
        guest_name,
        guest_email,
        guest_phone,
        company_name,
        invoice_date || new Date(),
        due_date,
        check_in_date,
        check_out_date,
        property_id || null,
        notes,
        req.user.id,
      ]
    );

    const invoiceId = inv.rows[0].id;

    // Insert line items if provided
    for (const item of line_items) {
      const qty = toNum(item.quantity) || 1;
      const price = toNum(item.unit_price);
      const vatRate = toNum(item.vat_rate ?? 15);
      const vatAmt = price * qty * (vatRate / 100);
      const total = price * qty + vatAmt;

      await client.query(
        `INSERT INTO invoice_line_items
          (invoice_id, category_id, description, quantity, unit_price, vat_rate, vat_amount, line_total, service_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          invoiceId,
          item.category_id || null,
          item.description,
          qty,
          price,
          vatRate,
          vatAmt,
          total,
          item.service_date || null,
        ]
      );
    }

    await recalcInvoice(client, invoiceId);

    const final = await client.query(`SELECT * FROM invoices WHERE id = $1`, [
      invoiceId,
    ]);
    await client.query("COMMIT");

    return res
      .status(201)
      .json({ message: "Invoice created", invoice: final.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("createInvoice error:", err);
    return res
      .status(500)
      .json({ error: "Failed to create invoice", details: err.message });
  } finally {
    client.release();
  }
};

// ── ADD LINE ITEM ─────────────────────────────────────────────
exports.addLineItem = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const invoiceId = parseInt(req.params.id);
    const {
      category_id,
      description,
      quantity = 1,
      unit_price,
      vat_rate = 15,
      service_date,
    } = req.body;

    if (!description || !unit_price)
      return res
        .status(400)
        .json({ error: "description and unit_price are required" });

    // Verify ownership
    const check = await client.query(
      `SELECT id, status FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, companyId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });
    if (check.rows[0].status === "paid")
      return res.status(400).json({ error: "Cannot modify a paid invoice" });

    await client.query("BEGIN");

    const qty = toNum(quantity);
    const price = toNum(unit_price);
    const vatRate = toNum(vat_rate);
    const vatAmt = price * qty * (vatRate / 100);
    const total = price * qty + vatAmt;

    const line = await client.query(
      `INSERT INTO invoice_line_items
        (invoice_id, category_id, description, quantity, unit_price, vat_rate, vat_amount, line_total, service_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        invoiceId,
        category_id || null,
        description,
        qty,
        price,
        vatRate,
        vatAmt,
        total,
        service_date || null,
      ]
    );

    await recalcInvoice(client, invoiceId);
    const updated = await client.query(`SELECT * FROM invoices WHERE id = $1`, [
      invoiceId,
    ]);

    await client.query("COMMIT");
    return res
      .status(201)
      .json({ line_item: line.rows[0], invoice: updated.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("addLineItem error:", err);
    return res
      .status(500)
      .json({ error: "Failed to add line item", details: err.message });
  } finally {
    client.release();
  }
};

// ── DELETE LINE ITEM ──────────────────────────────────────────
exports.deleteLineItem = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const { id: invoiceId, lineId } = req.params;

    const check = await client.query(
      `SELECT id FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, companyId]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });

    await client.query("BEGIN");
    await client.query(
      `DELETE FROM invoice_line_items WHERE id = $1 AND invoice_id = $2`,
      [lineId, invoiceId]
    );
    await recalcInvoice(client, parseInt(invoiceId));
    await client.query("COMMIT");

    return res.json({ message: "Line item deleted" });
  } catch (err) {
    await client.query("ROLLBACK");
    return res
      .status(500)
      .json({ error: "Failed to delete line item", details: err.message });
  } finally {
    client.release();
  }
};

// ── UPDATE INVOICE STATUS ─────────────────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { id } = req.params;
    const { status, notes } = req.body;

    const valid = ["draft", "sent", "partial", "paid", "cancelled"];
    if (!valid.includes(status))
      return res.status(400).json({ error: "Invalid status", valid });

    const result = await db.query(
      `UPDATE invoices SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3 AND company_id = $4 RETURNING *`,
      [status, notes, id, companyId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });

    return res.json({ message: "Status updated", invoice: result.rows[0] });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to update status", details: err.message });
  }
};

// ── RECORD PAYMENT ────────────────────────────────────────────
exports.recordPayment = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const invoiceId = parseInt(req.params.id);
    const { amount, payment_date, payment_method, reference, notes } = req.body;

    if (!amount || !payment_method)
      return res
        .status(400)
        .json({ error: "amount and payment_method are required" });

    const inv = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, companyId]
    );
    if (inv.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });
    if (inv.rows[0].status === "cancelled")
      return res.status(400).json({ error: "Cannot pay a cancelled invoice" });

    await client.query("BEGIN");

    const payment = await client.query(
      `INSERT INTO ar_payments (company_id, invoice_id, amount, payment_date, payment_method, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        companyId,
        invoiceId,
        toNum(amount),
        payment_date || new Date(),
        payment_method,
        reference,
        notes,
        req.user.id,
      ]
    );

    // Update invoice amounts paid + status
    const totalPaid = toNum(inv.rows[0].amount_paid) + toNum(amount);
    const totalAmount = toNum(inv.rows[0].total_amount);
    const newStatus =
      totalPaid >= totalAmount
        ? "paid"
        : totalPaid > 0
        ? "partial"
        : inv.rows[0].status;
    const balanceDue = Math.max(0, totalAmount - totalPaid);

    const updated = await client.query(
      `UPDATE invoices
       SET amount_paid = $1, balance_due = $2, status = $3, payment_method = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [totalPaid, balanceDue, newStatus, payment_method, invoiceId]
    );

    // Auto-create VAT transaction for output VAT
    if (newStatus === "paid") {
      const d = new Date(payment_date || new Date());
      await client.query(
        `INSERT INTO vat_transactions
          (company_id, transaction_type, source_type, source_id, transaction_date,
           gross_amount, vat_rate, vat_amount, net_amount, description, reference,
           vat_period_month, vat_period_year)
         VALUES ($1,'output','invoice',$2,$3,$4,15,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING`,
        [
          companyId,
          invoiceId,
          d,
          toNum(updated.rows[0].total_amount),
          toNum(updated.rows[0].vat_amount),
          toNum(updated.rows[0].subtotal),
          `Invoice ${updated.rows[0].invoice_number}`,
          updated.rows[0].invoice_number,
          d.getMonth() + 1,
          d.getFullYear(),
        ]
      );
    }

    await client.query("COMMIT");
    return res
      .status(201)
      .json({
        message: "Payment recorded",
        payment: payment.rows[0],
        invoice: updated.rows[0],
      });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("recordPayment error:", err);
    return res
      .status(500)
      .json({ error: "Failed to record payment", details: err.message });
  } finally {
    client.release();
  }
};

// ── GET REVENUE CATEGORIES ────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const cacheKey = `revenue_categories`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ data: cached, cached: true });

    const result = await db.query(
      `SELECT * FROM revenue_categories WHERE is_active = true ORDER BY sort_order`
    );

    cache.set(cacheKey, result.rows, CACHE_TTL.CATEGORIES);
    return res.json({ data: result.rows });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch categories", details: err.message });
  }
};


// ── AR SUMMARY ────────────────────────────────────────────────
exports.getARSummary = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const result = await db.query(
      `SELECT
        COUNT(*)                                                        as total_invoices,
        COUNT(CASE WHEN status = 'draft'     THEN 1 END)               as draft,
        COUNT(CASE WHEN status = 'sent'      THEN 1 END)               as sent,
        COUNT(CASE WHEN status = 'partial'   THEN 1 END)               as partial,
        COUNT(CASE WHEN status = 'paid'      THEN 1 END)               as paid,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END)               as cancelled,
        COALESCE(SUM(total_amount),  0)                                 as total_billed,
        COALESCE(SUM(amount_paid),   0)                                 as total_collected,
        COALESCE(SUM(balance_due),   0)                                 as total_outstanding,
        COALESCE(SUM(vat_amount),    0)                                 as total_vat
       FROM invoices WHERE company_id = $1`,
      [companyId]
    );
    return res.json(result.rows[0]);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch AR summary", details: err.message });
  }
};
// ── RECORD PAYMENT  (replace the existing recordPayment export)
// Now also auto-posts to daily_revenue so P&L picks it up immediately
// ─────────────────────────────────────────────────────────────────────
exports.recordPayment = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId  = req.user?.company_id;
    const invoiceId  = parseInt(req.params.id);
    const { amount, payment_date, payment_method, reference, notes } = req.body;

    if (!amount || !payment_method)
      return res
        .status(400)
        .json({ error: "amount and payment_method are required" });

    const inv = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND company_id = $2`,
      [invoiceId, companyId]
    );
    if (inv.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });
    if (inv.rows[0].status === "cancelled")
      return res.status(400).json({ error: "Cannot pay a cancelled invoice" });

    await client.query("BEGIN");

    // 1. Insert ar_payments record
    const payment = await client.query(
      `INSERT INTO ar_payments
         (company_id, invoice_id, amount, payment_date, payment_method, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        companyId, invoiceId, toNum(amount),
        payment_date || new Date(),
        payment_method, reference, notes, req.user.id,
      ]
    );

    // 2. Update invoice totals + status
    const totalPaid   = toNum(inv.rows[0].amount_paid) + toNum(amount);
    const totalAmount = toNum(inv.rows[0].total_amount);
    const newStatus   =
      totalPaid >= totalAmount ? "paid"
      : totalPaid > 0          ? "partial"
      :                          inv.rows[0].status;
    const balanceDue  = Math.max(0, totalAmount - totalPaid);

    const updated = await client.query(
      `UPDATE invoices
       SET amount_paid = $1, balance_due = $2, status = $3,
           payment_method = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [totalPaid, balanceDue, newStatus, payment_method, invoiceId]
    );

    const invoice = updated.rows[0];

    // 3. AUTO-POST OUTPUT VAT TRANSACTION (only when fully paid)
    if (newStatus === "paid") {
      const d = new Date(payment_date || new Date());
      await client.query(
        `INSERT INTO vat_transactions
           (company_id, transaction_type, source_type, source_id, transaction_date,
            gross_amount, vat_rate, vat_amount, net_amount, description, reference,
            vat_period_month, vat_period_year)
         VALUES ($1,'output','invoice',$2,$3,$4,15,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING`,
        [
          companyId, invoiceId, d,
          toNum(invoice.total_amount),
          toNum(invoice.vat_amount),
          toNum(invoice.subtotal),
          `Invoice ${invoice.invoice_number}`,
          invoice.invoice_number,
          d.getMonth() + 1,
          d.getFullYear(),
        ]
      );

      // 4. AUTO-POST TO daily_revenue
      //    Breaks the invoice total into revenue streams based on line items
      //    If no line items present, posts the whole amount to 'other_revenue'
      try {
        const lines = await client.query(
          `SELECT il.line_total, il.vat_amount, rc.code as cat_code
           FROM invoice_line_items il
           LEFT JOIN revenue_categories rc ON il.category_id = rc.id
           WHERE il.invoice_id = $1`,
          [invoiceId]
        );

        let rooms = 0, fb = 0, spa = 0, events = 0, other = 0;

        if (lines.rows.length > 0) {
          for (const line of lines.rows) {
            const net = toNum(line.line_total) - toNum(line.vat_amount);
            const code = (line.cat_code || "").toLowerCase();
            if      (code.includes("room"))   rooms  += net;
            else if (code.includes("fb") || code.includes("food") || code.includes("bev")) fb += net;
            else if (code.includes("spa"))    spa    += net;
            else if (code.includes("event"))  events += net;
            else                              other  += net;
          }
        } else {
          other = toNum(invoice.subtotal);
        }

        const pDate = payment_date
          ? new Date(payment_date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];

        await client.query(
          `INSERT INTO daily_revenue
             (company_id, property_id, revenue_date,
              rooms_revenue, fb_revenue, spa_revenue, events_revenue, other_revenue,
              total_revenue, total_vat, rooms_available, rooms_occupied, occupancy_rate,
              total_costs, notes, status, recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                   $4+$5+$6+$7+$8,          -- total_revenue
                   $9,                        -- total_vat
                   0,0,0,0,                   -- rooms stats (unknown from invoice)
                   $10,'Auto: Invoice '||$11,'approved',$12)
           ON CONFLICT (company_id, revenue_date, property_id)
           DO UPDATE SET
             rooms_revenue  = daily_revenue.rooms_revenue  + EXCLUDED.rooms_revenue,
             fb_revenue     = daily_revenue.fb_revenue     + EXCLUDED.fb_revenue,
             spa_revenue    = daily_revenue.spa_revenue    + EXCLUDED.spa_revenue,
             events_revenue = daily_revenue.events_revenue + EXCLUDED.events_revenue,
             other_revenue  = daily_revenue.other_revenue  + EXCLUDED.other_revenue,
             total_revenue  = daily_revenue.total_revenue  + EXCLUDED.total_revenue,
             total_vat      = daily_revenue.total_vat      + EXCLUDED.total_vat,
             updated_at     = NOW()`,
          [
            companyId,
            invoice.property_id || null,
            pDate,
            rooms, fb, spa, events, other,
            toNum(invoice.vat_amount),
            0,                          // total_costs — AP side handles this
            invoice.invoice_number,
            req.user.id,
          ]
        );
      } catch (revErr) {
        // Non-fatal — VAT transaction already posted, don't roll back
        console.warn("daily_revenue auto-post skipped:", revErr.message);
      }
    }

    await client.query("COMMIT");
    return res.status(201).json({
      message: "Payment recorded",
      payment: payment.rows[0],
      invoice: invoice,
      revenue_posted: newStatus === "paid",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("recordPayment error:", err);
    return res
      .status(500)
      .json({ error: "Failed to record payment", details: err.message });
  } finally {
    client.release();
  }
};