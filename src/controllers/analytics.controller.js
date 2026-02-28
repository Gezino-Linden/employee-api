// File: src/controllers/analytics.controller.js
const db = require("../db");

// =====================================================
// GET LEAVE ANALYTICS
// =====================================================
exports.getLeaveAnalytics = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const year = req.query.year || new Date().getFullYear();

    if (!companyId) {
      return res.status(400).json({ error: "Company ID missing" });
    }

    // Monthly trends data (REMOVED deleted_at filter)
    const monthlyQuery = `
      SELECT 
        EXTRACT(MONTH FROM start_date) as month,
        COUNT(*) as requests,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        SUM(CASE WHEN status = 'approved' THEN days_requested ELSE 0 END) as total_days
      FROM leave_requests
      WHERE company_id = $1 
        AND EXTRACT(YEAR FROM start_date) = $2
      GROUP BY EXTRACT(MONTH FROM start_date)
      ORDER BY month
    `;

    const monthlyResult = await db.query(monthlyQuery, [companyId, year]);

    // Fill in missing months with zeros
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthlyData = months.map((name, index) => {
      const monthNum = index + 1;
      const found = monthlyResult.rows.find(
        (r) => parseInt(r.month) === monthNum
      );
      return {
        month: name,
        requests: parseInt(found?.requests) || 0,
        approved: parseInt(found?.approved) || 0,
        rejected: parseInt(found?.rejected) || 0,
        pending: parseInt(found?.pending) || 0,
        total_days: parseInt(found?.total_days) || 0,
      };
    });

    // Leave type breakdown (REMOVED deleted_at filter)
    const typeQuery = `
      SELECT 
        lt.name as type_name,
        COUNT(*) as requests,
        SUM(lr.days_requested) as total_days
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.company_id = $1 
        AND EXTRACT(YEAR FROM lr.start_date) = $2
      GROUP BY lt.name
      ORDER BY requests DESC
    `;

    const typeResult = await db.query(typeQuery, [companyId, year]);

    // Summary stats (REMOVED deleted_at filter)
    const summaryQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        AVG(CASE WHEN status = 'approved' THEN days_requested END) as avg_days
      FROM leave_requests
      WHERE company_id = $1 
        AND EXTRACT(YEAR FROM start_date) = $2
    `;

    const summaryResult = await db.query(summaryQuery, [companyId, year]);
    const summary = summaryResult.rows[0];

    // Calculate rates
    const total = parseInt(summary.total_requests) || 0;
    const approved = parseInt(summary.approved) || 0;
    const rejected = parseInt(summary.rejected) || 0;

    res.json({
      monthly_trends: monthlyData,
      by_type: typeResult.rows.map((t) => ({
        type: t.type_name,
        requests: parseInt(t.requests),
        total_days: parseFloat(t.total_days).toFixed(2),
      })),
      summary: {
        total_requests: total,
        approved: approved,
        rejected: rejected,
        pending: parseInt(summary.pending) || 0,
        approval_rate: total > 0 ? ((approved / total) * 100).toFixed(0) : 0,
        rejection_rate: total > 0 ? ((rejected / total) * 100).toFixed(0) : 0,
        avg_days: parseFloat(summary.avg_days).toFixed(2) || 0,
      },
    });
  } catch (err) {
    console.error("=== ERROR in getLeaveAnalytics ===");
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch analytics",
      details: err.message,
    });
  }
};
