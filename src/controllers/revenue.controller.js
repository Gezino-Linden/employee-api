// File: src/controllers/revenue.controller.js
const db = require("../db");

function toNum(v) {
  return parseFloat(v) || 0;
}

// ── GET DAILY REVENUE ENTRIES ─────────────────────────────────
exports.getDailyRevenue = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { from, to, property_id, page = 1, per_page = 31 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    let query = `
      SELECT dr.*, p.name as property_name, u.name as recorded_by_name
      FROM daily_revenue dr
      LEFT JOIN properties p ON dr.property_id = p.id
      LEFT JOIN users u ON dr.recorded_by = u.id
      WHERE dr.company_id = $1
    `;
    const params = [companyId];
    let idx = 1;

    if (from) {
      idx++;
      query += ` AND dr.revenue_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      query += ` AND dr.revenue_date <= $${idx}`;
      params.push(to);
    }
    if (property_id) {
      idx++;
      query += ` AND dr.property_id = $${idx}`;
      params.push(property_id);
    }

    query += ` ORDER BY dr.revenue_date DESC LIMIT $${++idx} OFFSET $${++idx}`;
    params.push(parseInt(per_page), offset);

    const result = await db.query(query, params);
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch daily revenue", details: err.message });
  }
};

// ── UPSERT DAILY REVENUE ──────────────────────────────────────
// Creates or updates the revenue entry for a given date
exports.upsertDailyRevenue = async (req, res) => {
  const client = await db.connect();
  try {
    const companyId = req.user?.company_id;
    const {
      revenue_date,
      property_id,
      rooms_revenue = 0,
      fb_revenue = 0,
      spa_revenue = 0,
      events_revenue = 0,
      other_revenue = 0,
      rooms_available = 0,
      rooms_occupied = 0,
      notes,
      status = "draft",
    } = req.body;

    if (!revenue_date)
      return res.status(400).json({ error: "revenue_date is required" });

    await client.query("BEGIN");

    const totalRev =
      toNum(rooms_revenue) +
      toNum(fb_revenue) +
      toNum(spa_revenue) +
      toNum(events_revenue) +
      toNum(other_revenue);
    const totalVat = totalRev * 0.15;
    const occupancy =
      toNum(rooms_available) > 0
        ? (toNum(rooms_occupied) / toNum(rooms_available)) * 100
        : 0;

    // Auto-pull AP costs for the same date
    const costs = await client.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM ap_invoices
       WHERE company_id = $1 AND invoice_date = $2 AND status != 'cancelled'`,
      [companyId, revenue_date]
    );

    const result = await client.query(
      `INSERT INTO daily_revenue
        (company_id, property_id, revenue_date,
         rooms_revenue, fb_revenue, spa_revenue, events_revenue, other_revenue,
         total_revenue, total_vat, rooms_available, rooms_occupied, occupancy_rate,
         total_costs, notes, status, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (company_id, revenue_date, property_id)
       DO UPDATE SET
         rooms_revenue   = EXCLUDED.rooms_revenue,
         fb_revenue      = EXCLUDED.fb_revenue,
         spa_revenue     = EXCLUDED.spa_revenue,
         events_revenue  = EXCLUDED.events_revenue,
         other_revenue   = EXCLUDED.other_revenue,
         total_revenue   = EXCLUDED.total_revenue,
         total_vat       = EXCLUDED.total_vat,
         rooms_available = EXCLUDED.rooms_available,
         rooms_occupied  = EXCLUDED.rooms_occupied,
         occupancy_rate  = EXCLUDED.occupancy_rate,
         total_costs     = EXCLUDED.total_costs,
         notes           = EXCLUDED.notes,
         status          = EXCLUDED.status,
         recorded_by     = EXCLUDED.recorded_by,
         updated_at      = NOW()
       RETURNING *`,
      [
        companyId,
        property_id || null,
        revenue_date,
        toNum(rooms_revenue),
        toNum(fb_revenue),
        toNum(spa_revenue),
        toNum(events_revenue),
        toNum(other_revenue),
        totalRev,
        totalVat,
        toNum(rooms_available),
        toNum(rooms_occupied),
        occupancy,
        toNum(costs.rows[0].total),
        notes,
        status,
        req.user.id,
      ]
    );

    await client.query("COMMIT");
    return res
      .status(201)
      .json({
        success: true,
        message: "Daily revenue saved",
        revenue: result.rows[0],
      });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("upsertDailyRevenue error:", err);
    return res
      .status(500)
      .json({ error: "Failed to save daily revenue", details: err.message });
  } finally {
    client.release();
  }
};

// ── GET REVENUE SUMMARY ───────────────────────────────────────
// Aggregated totals for a date range — used by dashboard cards
exports.getRevenueSummary = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { from, to } = req.query;

    const params = [companyId];
    let dateFilter = "";
    if (from) {
      params.push(from);
      dateFilter += ` AND revenue_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND revenue_date <= $${params.length}`;
    }

    const result = await db.query(
      `SELECT
        COUNT(*)                             as days_recorded,
        COALESCE(SUM(rooms_revenue),  0)     as total_rooms,
        COALESCE(SUM(fb_revenue),     0)     as total_fb,
        COALESCE(SUM(spa_revenue),    0)     as total_spa,
        COALESCE(SUM(events_revenue), 0)     as total_events,
        COALESCE(SUM(other_revenue),  0)     as total_other,
        COALESCE(SUM(total_revenue),  0)     as total_revenue,
        COALESCE(SUM(total_vat),      0)     as total_vat,
        COALESCE(SUM(total_costs),    0)     as total_costs,
        COALESCE(SUM(total_revenue) - SUM(total_costs), 0) as gross_profit,
        COALESCE(AVG(occupancy_rate), 0)     as avg_occupancy,
        COALESCE(SUM(rooms_occupied), 0)     as total_rooms_occupied
       FROM daily_revenue
       WHERE company_id = $1 ${dateFilter}`,
      params
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to fetch revenue summary", details: err.message });
  }
};
