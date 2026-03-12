// File: src/controllers/analytics.controller.js
const db = require("../db");

// =====================================================
// HELPERS
// =====================================================
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getDateRange(period) {
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case "today":
      startDate = endDate = now.toISOString().split("T")[0];
      break;
    case "week":
      const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
      startDate = weekStart.toISOString().split("T")[0];
      endDate = new Date().toISOString().split("T")[0];
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split("T")[0];
      break;
    case "year":
      startDate = `${now.getFullYear()}-01-01`;
      endDate = `${now.getFullYear()}-12-31`;
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];
      endDate = new Date().toISOString().split("T")[0];
  }

  return { startDate, endDate };
}

// =====================================================
// MAIN DASHBOARD OVERVIEW
// Get all KPIs for main dashboard
// =====================================================
exports.getDashboardOverview = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    // Employee Stats
    const employees = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_employees,
        CAST(COUNT(CASE WHEN is_active = true THEN 1 END) AS INTEGER) as active_employees,
        CAST(COUNT(CASE WHEN is_active = false THEN 1 END) AS INTEGER) as inactive_employees
       FROM employees WHERE company_id = $1`,
      [companyId]
    );

    // Payroll Stats (current month)
    const payroll = await db.query(
      `SELECT 
        COALESCE(SUM(gross_pay), 0) as total_gross,
        COALESCE(SUM(net_pay), 0) as total_net,
        COALESCE(SUM(total_deductions), 0) as total_deductions,
        COALESCE(SUM(tax), 0) as total_tax,
        CAST(COUNT(*) AS INTEGER) as processed_count
       FROM payroll_records 
       WHERE company_id = $1 AND month = $2 AND year = $3 AND status IN ('processed', 'paid')`,
      [companyId, month, year]
    );

    // Leave Stats
    const leave = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_requests,
        CAST(COUNT(CASE WHEN status = 'pending' THEN 1 END) AS INTEGER) as pending_requests,
        CAST(COUNT(CASE WHEN status = 'approved' THEN 1 END) AS INTEGER) as approved_requests,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN days_requested ELSE 0 END), 0) as total_days_taken
       FROM leave_requests 
       WHERE company_id = $1 AND EXTRACT(YEAR FROM start_date) = $2`,
      [companyId, year]
    );

    // Attendance Stats (current month)
    const attendance = await db.query(
      `SELECT 
        CAST(COUNT(DISTINCT employee_id) AS INTEGER) as unique_employees,
        CAST(COUNT(CASE WHEN status = 'present' THEN 1 END) AS INTEGER) as present_count,
        CAST(COUNT(CASE WHEN status = 'late' THEN 1 END) AS INTEGER) as late_count,
        CAST(COUNT(CASE WHEN status = 'absent' THEN 1 END) AS INTEGER) as absent_count,
        COALESCE(AVG(total_hours), 0) as avg_hours_worked
       FROM attendance_records 
       WHERE company_id = $1 
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3`,
      [companyId, month, year]
    );

    // Compliance Stats
    const compliance = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_declarations,
        CAST(COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) AS INTEGER) as pending_payments,
        CAST(COUNT(CASE WHEN submission_status = 'draft' THEN 1 END) AS INTEGER) as pending_submissions,
        COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN total_liability ELSE 0 END), 0) as outstanding_amount
       FROM emp201_declarations 
       WHERE company_id = $1 AND tax_year = $2`,
      [companyId, year.toString()]
    );

    return res.json({
      employees: employees.rows[0],
      payroll: payroll.rows[0],
      leave: leave.rows[0],
      attendance: attendance.rows[0],
      compliance: compliance.rows[0],
    });
  } catch (err) {
    console.error("ERROR in getDashboardOverview:", err);
    return res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
};

// =====================================================
// PAYROLL ANALYTICS
// =====================================================
exports.getPayrollAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Monthly payroll trend
    const monthlyTrend = await db.query(
      `SELECT 
        month,
        CAST(COUNT(*) AS INTEGER) as employee_count,
        COALESCE(SUM(gross_pay), 0) as total_gross,
        COALESCE(SUM(net_pay), 0) as total_net,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(SUM(total_deductions), 0) as total_deductions
       FROM payroll_records 
       WHERE company_id = $1 AND year = $2 AND status IN ('processed', 'paid')
       GROUP BY month 
       ORDER BY month`,
      [companyId, year]
    );

    // Department breakdown
    const departmentBreakdown = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employee_count,
        COALESCE(SUM(pr.gross_pay), 0) as total_gross,
        COALESCE(SUM(pr.net_pay), 0) as total_net,
        COALESCE(AVG(pr.gross_pay), 0) as avg_salary
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 AND pr.year = $2 AND pr.status IN ('processed', 'paid')
       GROUP BY e.department
       ORDER BY total_gross DESC`,
      [companyId, year]
    );

    // Position breakdown
    const positionBreakdown = await db.query(
      `SELECT 
        e.position,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employee_count,
        COALESCE(AVG(pr.gross_pay), 0) as avg_salary,
        COALESCE(MIN(pr.gross_pay), 0) as min_salary,
        COALESCE(MAX(pr.gross_pay), 0) as max_salary
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 AND pr.year = $2 AND pr.status IN ('processed', 'paid')
       GROUP BY e.position
       ORDER BY avg_salary DESC
       LIMIT 10`,
      [companyId, year]
    );

    // Cost breakdown (current month)
    const currentMonth = new Date().getMonth() + 1;
    const costBreakdown = await db.query(
      `SELECT 
        COALESCE(SUM(basic_salary), 0) as basic_salary,
        COALESCE(SUM(allowances), 0) as allowances,
        COALESCE(SUM(bonuses), 0) as bonuses,
        COALESCE(SUM(overtime), 0) as overtime,
        COALESCE(SUM(tax), 0) as tax,
        COALESCE(SUM(uif), 0) as uif,
        COALESCE(SUM(pension), 0) as pension,
        COALESCE(SUM(medical_aid), 0) as medical_aid
       FROM payroll_records 
       WHERE company_id = $1 AND year = $2 AND month = $3 AND status IN ('processed', 'paid')`,
      [companyId, year, currentMonth]
    );

    return res.json({
      monthlyTrend: monthlyTrend.rows,
      departmentBreakdown: departmentBreakdown.rows,
      positionBreakdown: positionBreakdown.rows,
      costBreakdown: costBreakdown.rows[0],
    });
  } catch (err) {
    console.error("ERROR in getPayrollAnalytics:", err);
    return res.status(500).json({ error: "Failed to fetch payroll analytics" });
  }
};

// =====================================================
// LEAVE ANALYTICS
// =====================================================
exports.getLeaveAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Leave type breakdown
    const leaveTypes = await db.query(
      `SELECT 
        lt.name as leave_type,
        CAST(COUNT(lr.id) AS INTEGER) as request_count,
        COALESCE(SUM(lr.days_requested), 0) as total_days,
        CAST(COUNT(CASE WHEN lr.status = 'approved' THEN 1 END) AS INTEGER) as approved_count,
        CAST(COUNT(CASE WHEN lr.status = 'rejected' THEN 1 END) AS INTEGER) as rejected_count
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       WHERE lr.company_id = $1 AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY lt.name
       ORDER BY total_days DESC`,
      [companyId, year]
    );

    // Monthly leave trend
    const monthlyLeave = await db.query(
      `SELECT 
        EXTRACT(MONTH FROM start_date)::INTEGER as month,
        CAST(COUNT(*) AS INTEGER) as request_count,
        COALESCE(SUM(days_requested), 0) as total_days,
        CAST(COUNT(CASE WHEN status = 'approved' THEN 1 END) AS INTEGER) as approved_count
       FROM leave_requests 
       WHERE company_id = $1 AND EXTRACT(YEAR FROM start_date) = $2
       GROUP BY EXTRACT(MONTH FROM start_date)
       ORDER BY month`,
      [companyId, year]
    );

    // Department leave usage
    const departmentLeave = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(lr.id) AS INTEGER) as request_count,
        COALESCE(SUM(lr.days_requested), 0) as total_days,
        CAST(COUNT(DISTINCT lr.employee_id) AS INTEGER) as unique_employees
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.company_id = $1 AND EXTRACT(YEAR FROM lr.start_date) = $2
       GROUP BY e.department
       ORDER BY total_days DESC`,
      [companyId, year]
    );

    // Approval rate
    const approvalStats = await db.query(
      `SELECT 
        CAST(COUNT(*) AS INTEGER) as total_requests,
        CAST(COUNT(CASE WHEN status = 'approved' THEN 1 END) AS INTEGER) as approved,
        CAST(COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS INTEGER) as rejected,
        CAST(COUNT(CASE WHEN status = 'pending' THEN 1 END) AS INTEGER) as pending,
        CASE 
          WHEN COUNT(*) > 0 
          THEN ROUND((COUNT(CASE WHEN status = 'approved' THEN 1 END)::DECIMAL / COUNT(*)) * 100, 2)
          ELSE 0 
        END as approval_rate
       FROM leave_requests 
       WHERE company_id = $1 AND EXTRACT(YEAR FROM start_date) = $2`,
      [companyId, year]
    );

    return res.json({
      leaveTypes: leaveTypes.rows,
      monthlyLeave: monthlyLeave.rows,
      departmentLeave: departmentLeave.rows,
      approvalStats: approvalStats.rows[0],
    });
  } catch (err) {
    console.error("ERROR in getLeaveAnalytics:", err);
    return res.status(500).json({ error: "Failed to fetch leave analytics" });
  }
};

// =====================================================
// ATTENDANCE ANALYTICS
// =====================================================
exports.getAttendanceAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    // Daily attendance for current month
    const dailyAttendance = await db.query(
      `SELECT 
        date,
        CAST(COUNT(*) AS INTEGER) as total_records,
        CAST(COUNT(CASE WHEN status = 'present' THEN 1 END) AS INTEGER) as present,
        CAST(COUNT(CASE WHEN status = 'late' THEN 1 END) AS INTEGER) as late,
        CAST(COUNT(CASE WHEN status = 'absent' THEN 1 END) AS INTEGER) as absent,
        COALESCE(AVG(total_hours), 0) as avg_hours
       FROM attendance_records 
       WHERE company_id = $1 
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3
       GROUP BY date
       ORDER BY date`,
      [companyId, month, year]
    );

    // Department attendance
    const departmentAttendance = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(ar.id) AS INTEGER) as total_records,
        CAST(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) AS INTEGER) as present_count,
        CAST(COUNT(CASE WHEN ar.status = 'late' THEN 1 END) AS INTEGER) as late_count,
        CASE 
          WHEN COUNT(ar.id) > 0 
          THEN ROUND((COUNT(CASE WHEN ar.status = 'present' THEN 1 END)::DECIMAL / COUNT(ar.id)) * 100, 2)
          ELSE 0 
        END as attendance_rate
       FROM attendance_records ar
       JOIN employees e ON ar.employee_id = e.id
       WHERE ar.company_id = $1 
         AND EXTRACT(MONTH FROM ar.date) = $2 
         AND EXTRACT(YEAR FROM ar.date) = $3
       GROUP BY e.department
       ORDER BY attendance_rate DESC`,
      [companyId, month, year]
    );

    // Overtime analysis
    const overtimeStats = await db.query(
      `SELECT 
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
        COALESCE(SUM(overtime_pay), 0) as total_overtime_pay,
        COALESCE(AVG(overtime_hours), 0) as avg_overtime_per_employee,
        CAST(COUNT(CASE WHEN overtime_hours > 0 THEN 1 END) AS INTEGER) as employees_with_overtime
       FROM attendance_records 
       WHERE company_id = $1 
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3`,
      [companyId, month, year]
    );

    // Late arrivals trend
    const lateArrivals = await db.query(
      `SELECT 
        date,
        CAST(COUNT(CASE WHEN late_minutes > 0 THEN 1 END) AS INTEGER) as late_count,
        COALESCE(AVG(late_minutes), 0) as avg_late_minutes
       FROM attendance_records 
       WHERE company_id = $1 
         AND EXTRACT(MONTH FROM date) = $2 
         AND EXTRACT(YEAR FROM date) = $3
         AND late_minutes > 0
       GROUP BY date
       ORDER BY date`,
      [companyId, month, year]
    );

    return res.json({
      dailyAttendance: dailyAttendance.rows,
      departmentAttendance: departmentAttendance.rows,
      overtimeStats: overtimeStats.rows[0],
      lateArrivals: lateArrivals.rows,
    });
  } catch (err) {
    console.error("ERROR in getAttendanceAnalytics:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch attendance analytics" });
  }
};

// =====================================================
// COMPLIANCE ANALYTICS
// =====================================================
exports.getComplianceAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // EMP201 submissions
    const emp201Stats = await db.query(
      `SELECT 
        tax_period as month,
        total_liability,
        payment_status,
        submission_status,
        period_end_date,
        payment_date
       FROM emp201_declarations 
       WHERE company_id = $1 AND tax_year = $2
       ORDER BY tax_period`,
      [companyId, year.toString()]
    );

    // Outstanding payments
    const outstanding = await db.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN total_liability ELSE 0 END), 0) as total_outstanding,
        CAST(COUNT(CASE WHEN payment_status = 'overdue' THEN 1 END) AS INTEGER) as overdue_count,
        CAST(COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) AS INTEGER) as pending_count
       FROM emp201_declarations 
       WHERE company_id = $1 AND tax_year = $2`,
      [companyId, year.toString()]
    );

    // Submission timeline
    const submissionTimeline = await db.query(
      `SELECT 
        tax_period as month,
        submission_status,
        submission_date,
        payment_status,
        payment_date,
        total_liability
       FROM emp201_declarations 
       WHERE company_id = $1 AND tax_year = $2
       ORDER BY tax_period DESC
       LIMIT 12`,
      [companyId, year.toString()]
    );

    return res.json({
      emp201Stats: emp201Stats.rows,
      outstanding: outstanding.rows[0],
      submissionTimeline: submissionTimeline.rows,
    });
  } catch (err) {
    console.error("ERROR in getComplianceAnalytics:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch compliance analytics" });
  }
};

// =====================================================
// HR INSIGHTS
// =====================================================
exports.getHRInsights = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    // Headcount by department
    const headcount = await db.query(
      `SELECT 
        department,
        CAST(COUNT(*) AS INTEGER) as count,
        CAST(COUNT(CASE WHEN is_active = true THEN 1 END) AS INTEGER) as active_count
       FROM employees 
       WHERE company_id = $1
       GROUP BY department
       ORDER BY count DESC`,
      [companyId]
    );

    // Gender distribution
    const genderDist = await db.query(
      `SELECT 
        gender,
        CAST(COUNT(*) AS INTEGER) as count
       FROM employees 
       WHERE company_id = $1 AND is_active = true
       GROUP BY gender`,
      [companyId]
    );

    // Age distribution
    const ageDist = await db.query(
      `SELECT 
        CASE 
          WHEN age < 25 THEN 'Under 25'
          WHEN age BETWEEN 25 AND 34 THEN '25-34'
          WHEN age BETWEEN 35 AND 44 THEN '35-44'
          WHEN age BETWEEN 45 AND 54 THEN '45-54'
          ELSE '55+'
        END as age_group,
        CAST(COUNT(*) AS INTEGER) as count
       FROM employees 
       WHERE company_id = $1 AND is_active = true
       GROUP BY age_group
       ORDER BY age_group`,
      [companyId]
    );

    // Salary statistics
    const salaryStats = await db.query(
      `SELECT 
        COALESCE(AVG(salary), 0) as avg_salary,
        COALESCE(MIN(salary), 0) as min_salary,
        COALESCE(MAX(salary), 0) as max_salary,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary), 0) as median_salary
       FROM employees 
       WHERE company_id = $1 AND is_active = true`,
      [companyId]
    );

    return res.json({
      headcount: headcount.rows,
      genderDistribution: genderDist.rows,
      ageDistribution: ageDist.rows,
      salaryStats: salaryStats.rows[0],
    });
  } catch (err) {
    console.error("ERROR in getHRInsights:", err);
    return res.status(500).json({ error: "Failed to fetch HR insights" });
  }
};

// =====================================================
// EXPORT REPORT
// Generate comprehensive report
// =====================================================
exports.exportReport = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { reportType, year, month, format } = req.query;

    // This is a placeholder - full implementation would generate PDF/Excel
    // For now, return JSON data

    let reportData = {};

    switch (reportType) {
      case "payroll":
        reportData = await getPayrollReport(companyId, year, month);
        break;
      case "leave":
        reportData = await getLeaveReport(companyId, year);
        break;
      case "attendance":
        reportData = await getAttendanceReport(companyId, year, month);
        break;
      case "compliance":
        reportData = await getComplianceReport(companyId, year);
        break;
      default:
        return res.status(400).json({ error: "Invalid report type" });
    }

    return res.json(reportData);
  } catch (err) {
    console.error("ERROR in exportReport:", err);
    return res.status(500).json({ error: "Failed to export report" });
  }
};

// Helper functions for report generation
async function getPayrollReport(companyId, year, month) {
  // Implementation here
  return { message: "Payroll report data" };
}

async function getLeaveReport(companyId, year) {
  // Implementation here
  return { message: "Leave report data" };
}

async function getAttendanceReport(companyId, year, month) {
  // Implementation here
  return { message: "Attendance report data" };
}

async function getComplianceReport(companyId, year) {
  // Implementation here
  return { message: "Compliance report data" };
}


// =====================================================
// REVENUE vs LABOUR ANALYTICS
// =====================================================
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { year } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();

    // Monthly revenue from daily_revenue table
    const revenueQuery = await db.query(`
      SELECT
        EXTRACT(MONTH FROM revenue_date) as month,
        SUM(total_revenue) as total_revenue,
        SUM(rooms_revenue) as rooms_revenue,
        SUM(fb_revenue) as fb_revenue,
        SUM(other_revenue) as other_revenue,
        AVG(occupancy_rate) as avg_occupancy,
        COUNT(*) as days_recorded
      FROM daily_revenue
      WHERE company_id = $1 AND EXTRACT(YEAR FROM revenue_date) = $2
      GROUP BY EXTRACT(MONTH FROM revenue_date)
      ORDER BY month
    `, [companyId, targetYear]);

    // Monthly labour cost from payroll_records
    const labourQuery = await db.query(`
      SELECT
        pay_month as month,
        SUM(gross_pay) as total_labour_cost,
        COUNT(DISTINCT employee_id) as headcount
      FROM payroll_records
      WHERE company_id = $1 AND pay_year = $2 AND status = 'paid'
      GROUP BY pay_month
      ORDER BY pay_month
    `, [companyId, targetYear]);

    // Merge revenue and labour by month
    const monthlyData = revenueQuery.rows.map(rev => {
      const labour = labourQuery.rows.find(l => parseInt(l.month) === parseInt(rev.month));
      const totalRevenue = parseFloat(rev.total_revenue) || 0;
      const labourCost = labour ? parseFloat(labour.total_labour_cost) : 0;
      const labourPct = totalRevenue > 0 ? (labourCost / totalRevenue * 100) : 0;
      const headcount = labour ? parseInt(labour.headcount) : 0;
      const revenuePerEmployee = headcount > 0 ? totalRevenue / headcount : 0;
      return {
        month: parseInt(rev.month),
        total_revenue: totalRevenue.toFixed(2),
        rooms_revenue: parseFloat(rev.rooms_revenue || 0).toFixed(2),
        fb_revenue: parseFloat(rev.fb_revenue || 0).toFixed(2),
        other_revenue: parseFloat(rev.other_revenue || 0).toFixed(2),
        avg_occupancy: parseFloat(rev.avg_occupancy || 0).toFixed(1),
        days_recorded: parseInt(rev.days_recorded),
        labour_cost: labourCost.toFixed(2),
        headcount,
        labour_pct: labourPct.toFixed(1),
        revenue_per_employee: revenuePerEmployee.toFixed(2),
        flag: labourPct > 40 ? 'danger' : labourPct > 32 ? 'warning' : 'good'
      };
    });

    // Totals
    const totalRevenue = revenueQuery.rows.reduce((s, r) => s + parseFloat(r.total_revenue || 0), 0);
    const totalLabour = labourQuery.rows.reduce((s, l) => s + parseFloat(l.total_labour_cost || 0), 0);

    return res.json({
      monthlyData,
      summary: {
        total_revenue: totalRevenue.toFixed(2),
        total_labour_cost: totalLabour.toFixed(2),
        overall_labour_pct: totalRevenue > 0 ? (totalLabour / totalRevenue * 100).toFixed(1) : '0',
        benchmark_min: '28',
        benchmark_max: '35'
      }
    });
  } catch (err) {
    console.error("ERROR in getRevenueAnalytics:", err);
    return res.status(500).json({ error: "Failed to fetch revenue analytics" });
  }
};


