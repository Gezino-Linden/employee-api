// src/routes/audit.routes.js
const express = require("express");
const router = express.Router();
const db = require("../db");
const { requireAuth, requireMinRole } = require("../middleware");

// GET /api/audit — view audit logs (hr_manager and above)
router.get("/", requireAuth, requireMinRole("hr_manager"), async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const entityType = req.query.entity_type || null;
    const userId = req.query.user_id || null;

    let where = "WHERE company_id = $1";
    const params = [companyId];
    let idx = 2;

    if (entityType) {
      where += ` AND entity_type = $${idx++}`;
      params.push(entityType);
    }
    if (userId) {
      where += ` AND performed_by = $${idx++}`;
      params.push(userId);
    }

    const total = await db.query(
      `SELECT COUNT(*) FROM audit_logs ${where}`,
      params
    );
    const rows = await db.query(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${
        idx + 1
      }`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      total: parseInt(total.rows[0].count),
      page,
      limit,
      data: rows.rows,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
