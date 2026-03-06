// File: src/controllers/audit.controller.js
const db = require("../db");

// GET /api/audit — paginated audit log
exports.getAuditLogs = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const entityType = req.query.entity_type || null;
    const userId = req.query.user_id || null;
    const action = req.query.action || null;

    let where = "WHERE company_id = $1";
    const params = [companyId];
    let idx = 2;

    if (entityType) {
      where += ` AND entity_type = $${idx++}`;
      params.push(entityType);
    }
    if (userId) {
      where += ` AND performed_by = $${idx++}`;
      params.push(parseInt(userId));
    }
    if (action) {
      where += ` AND action = $${idx++}`;
      params.push(action);
    }

    const totalRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM audit_logs ${where}`,
      params
    );
    const rows = await db.query(
      `SELECT id, performed_by, performed_by_name, performed_by_role,
              action, entity_type, entity_id, entity_name,
              changes, ip_address, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      total: totalRes.rows[0].total,
      page,
      limit,
      totalPages: Math.ceil(totalRes.rows[0].total / limit),
      data: rows.rows,
    });
  } catch (err) {
    console.error("getAuditLogs error:", err);
    return res.status(500).json({ error: "Failed to fetch audit logs" });
  }
};

// GET /api/audit/summary — counts by action/entity for dashboard widget
exports.getAuditSummary = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const days = parseInt(req.query.days) || 30;

    const rows = await db.query(
      `SELECT action, entity_type, COUNT(*)::int AS count
       FROM audit_logs
       WHERE company_id = $1
         AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY action, entity_type
       ORDER BY count DESC`,
      [companyId, days]
    );

    const recent = await db.query(
      `SELECT performed_by_name, performed_by_role, action, entity_type,
              entity_name, created_at
       FROM audit_logs
       WHERE company_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [companyId]
    );

    return res.json({
      success: true,
      period_days: days,
      summary: rows.rows,
      recent_activity: recent.rows,
    });
  } catch (err) {
    console.error("getAuditSummary error:", err);
    return res.status(500).json({ error: "Failed to fetch audit summary" });
  }
};
