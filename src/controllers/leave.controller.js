// File: src/controllers/leave.controller.js
const db = require("../db");

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// =====================================================
// GET LEAVE TYPES
// =====================================================
exports.getLeaveTypes = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, default_days_per_year, is_paid, requires_approval, is_active
       FROM leave_types
       WHERE is_active = true
       ORDER BY name`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave types" });
  }
};

// =====================================================
// GET MY LEAVE BALANCES
// =====================================================
exports.getMyBalances = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;
    const year = toInt(req.query.year, new Date().getFullYear());

    // Get employee_id from user_id
    const empResult = await db.query(
      `SELECT id FROM employees WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    const employeeId = empResult.rows[0].id;

    const result = await db.query(
      `SELECT 
        lb.id,
        lb.employee_id,
        lt.id as leave_type_id,
        lt.name as leave_type,
        lt.is_paid,
        lb.year,
        lb.total_days,
        lb.used_days,
        lb.pending_days,
        lb.remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = $1 AND lb.year = $2
       ORDER BY lt.name`,
      [employeeId, year]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave balances" });
  }
};

// =====================================================
// GET EMPLOYEE LEAVE BALANCES (Admin/Manager)
// =====================================================
exports.getEmployeeBalances = async (req, res) => {
  try {
    const employeeId = toInt(req.params.employeeId, 0);
    const year = toInt(req.query.year, new Date().getFullYear());
    const companyId = req.user.company_id;

    if (!employeeId) {
      return res.status(400).json({ error: "Invalid employee ID" });
    }

    // Verify employee belongs to same company
    const empCheck = await db.query(
      `SELECT id FROM employees WHERE id = $1 AND company_id = $2`,
      [employeeId, companyId]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const result = await db.query(
      `SELECT 
        lb.id,
        lb.employee_id,
        lt.id as leave_type_id,
        lt.name as leave_type,
        lt.is_paid,
        lb.year,
        lb.total_days,
        lb.used_days,
        lb.pending_days,
        lb.remaining_days
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.employee_id = $1 AND lb.year = $2
       ORDER BY lt.name`,
      [employeeId, year]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave balances" });
  }
};

// =====================================================
// GET MY LEAVE REQUESTS
// =====================================================
exports.getMyRequests = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const status = req.query.status; // optional filter

    // Get employee_id
    const empResult = await db.query(
      `SELECT id FROM employees WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    const employeeId = empResult.rows[0].id;

    let query = `
      SELECT 
        lr.id,
        lr.employee_id,
        lr.leave_type_id,
        lt.name as leave_type,
        lr.start_date,
        lr.end_date,
        lr.days_requested,
        lr.reason,
        lr.status,
        lr.reviewed_by,
        u.name as reviewed_by_name,
        lr.reviewed_at,
        lr.review_notes,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.employee_id = $1
    `;

    const params = [employeeId];

    if (status) {
      query += ` AND lr.status = $2`;
      params.push(status);
    }

    query += ` ORDER BY lr.created_at DESC`;

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave requests" });
  }
};

// =====================================================
// GET ALL LEAVE REQUESTS (Admin/Manager)
// =====================================================
exports.getAllRequests = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const status = req.query.status;
    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = Math.min(Math.max(toInt(req.query.limit, 20), 1), 100);
    const offset = (page - 1) * limit;

    let whereClause = `WHERE lr.company_id = $1`;
    const params = [companyId];

    if (status) {
      whereClause += ` AND lr.status = $2`;
      params.push(status);
    }

    // Get total count
    const countQuery = `SELECT COUNT(*)::int as total FROM leave_requests lr ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    // Get requests
    const dataQuery = `
      SELECT 
        lr.id,
        lr.employee_id,
        e.first_name,
        e.last_name,
        e.email,
        lr.leave_type_id,
        lt.name as leave_type,
        lr.start_date,
        lr.end_date,
        lr.days_requested,
        lr.reason,
        lr.status,
        lr.reviewed_by,
        u.name as reviewed_by_name,
        lr.reviewed_at,
        lr.review_notes,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      ${whereClause}
      ORDER BY 
        CASE WHEN lr.status = 'pending' THEN 0 ELSE 1 END,
        lr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await db.query(dataQuery, [...params, limit, offset]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave requests" });
  }
};

// =====================================================
// GET LEAVE REQUEST BY ID
// =====================================================
exports.getRequestById = async (req, res) => {
  try {
    const requestId = toInt(req.params.id, 0);
    const companyId = req.user.company_id;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    const result = await db.query(
      `SELECT 
        lr.id,
        lr.employee_id,
        e.first_name,
        e.last_name,
        e.email,
        lr.leave_type_id,
        lt.name as leave_type,
        lr.start_date,
        lr.end_date,
        lr.days_requested,
        lr.reason,
        lr.status,
        lr.reviewed_by,
        u.name as reviewed_by_name,
        lr.reviewed_at,
        lr.review_notes,
        lr.created_at,
        lr.updated_at
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      LEFT JOIN users u ON lr.reviewed_by = u.id
      WHERE lr.id = $1 AND lr.company_id = $2`,
      [requestId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Leave request not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave request" });
  }
};

// =====================================================
// CREATE LEAVE REQUEST
// =====================================================
exports.createRequest = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { leave_type_id, start_date, end_date, reason } = req.body;

    // Get employee_id
    const empResult = await db.query(
      `SELECT id FROM employees WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    const employeeId = empResult.rows[0].id;

    // Validation
    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (startDate > endDate) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    if (startDate < new Date()) {
      return res
        .status(400)
        .json({ error: "Cannot request leave in the past" });
    }

    await db.query("BEGIN");

    // Create request (days_requested will be auto-calculated by trigger)
    const result = await db.query(
      `INSERT INTO leave_requests (employee_id, leave_type_id, company_id, start_date, end_date, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        employeeId,
        leave_type_id,
        companyId,
        start_date,
        end_date,
        reason || null,
      ]
    );

    const newRequest = result.rows[0];

    // Update leave balance - add to pending
    await db.query(
      `UPDATE leave_balances
       SET pending_days = pending_days + $1, updated_at = NOW()
       WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
      [
        newRequest.days_requested,
        employeeId,
        leave_type_id,
        startDate.getFullYear(),
      ]
    );

    await db.query("COMMIT");

    return res.status(201).json(newRequest);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to create leave request" });
  }
};

// =====================================================
// CANCEL LEAVE REQUEST
// =====================================================
exports.cancelRequest = async (req, res) => {
  try {
    const requestId = toInt(req.params.id, 0);
    const companyId = req.user.company_id;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    // Get employee_id
    const empResult = await db.query(
      `SELECT id FROM employees WHERE company_id = $1 LIMIT 1`,
      [companyId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: "Employee record not found" });
    }

    const employeeId = empResult.rows[0].id;

    await db.query("BEGIN");

    // Check if request exists and belongs to user
    const checkResult = await db.query(
      `SELECT * FROM leave_requests WHERE id = $1 AND employee_id = $2 AND company_id = $3`,
      [requestId, employeeId, companyId]
    );

    if (checkResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Leave request not found" });
    }

    const request = checkResult.rows[0];

    if (request.status !== "pending") {
      await db.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Can only cancel pending requests" });
    }

    // Update status
    await db.query(
      `UPDATE leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [requestId]
    );

    // Update balance - remove from pending
    await db.query(
      `UPDATE leave_balances
       SET pending_days = pending_days - $1, updated_at = NOW()
       WHERE employee_id = $2 AND leave_type_id = $3 AND year = $4`,
      [
        request.days_requested,
        employeeId,
        request.leave_type_id,
        new Date(request.start_date).getFullYear(),
      ]
    );

    // Audit log
    await db.query(
      `INSERT INTO leave_request_audit (leave_request_id, changed_by, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, req.user.id, "pending", "cancelled", "Cancelled by employee"]
    );

    await db.query("COMMIT");

    return res.json({ message: "Leave request cancelled successfully" });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to cancel leave request" });
  }
};

// =====================================================
// APPROVE LEAVE REQUEST
// =====================================================
exports.approveRequest = async (req, res) => {
  try {
    const requestId = toInt(req.params.id, 0);
    const companyId = req.user.company_id;
    const { notes } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    await db.query("BEGIN");

    // Get request
    const checkResult = await db.query(
      `SELECT * FROM leave_requests WHERE id = $1 AND company_id = $2`,
      [requestId, companyId]
    );

    if (checkResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Leave request not found" });
    }

    const request = checkResult.rows[0];

    if (request.status !== "pending") {
      await db.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Can only approve pending requests" });
    }

    // Update request
    await db.query(
      `UPDATE leave_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, notes || null, requestId]
    );

    // Audit log
    await db.query(
      `INSERT INTO leave_request_audit (leave_request_id, changed_by, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        requestId,
        req.user.id,
        "pending",
        "approved",
        notes || "Approved by manager",
      ]
    );

    await db.query("COMMIT");

    return res.json({ message: "Leave request approved successfully" });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to approve leave request" });
  }
};

// =====================================================
// REJECT LEAVE REQUEST
// =====================================================
exports.rejectRequest = async (req, res) => {
  try {
    const requestId = toInt(req.params.id, 0);
    const companyId = req.user.company_id;
    const { notes } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "Invalid request ID" });
    }

    await db.query("BEGIN");

    // Get request
    const checkResult = await db.query(
      `SELECT * FROM leave_requests WHERE id = $1 AND company_id = $2`,
      [requestId, companyId]
    );

    if (checkResult.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "Leave request not found" });
    }

    const request = checkResult.rows[0];

    if (request.status !== "pending") {
      await db.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Can only reject pending requests" });
    }

    // Update request
    await db.query(
      `UPDATE leave_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, notes || null, requestId]
    );

    // Audit log
    await db.query(
      `INSERT INTO leave_request_audit (leave_request_id, changed_by, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        requestId,
        req.user.id,
        "pending",
        "rejected",
        notes || "Rejected by manager",
      ]
    );

    await db.query("COMMIT");

    return res.json({ message: "Leave request rejected successfully" });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Failed to reject leave request" });
  }
};

// =====================================================
// GET LEAVE CALENDAR
// =====================================================
exports.getLeaveCalendar = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT 
        lr.id,
        lr.employee_id,
        e.first_name,
        e.last_name,
        lt.name as leave_type,
        lr.start_date,
        lr.end_date,
        lr.days_requested,
        lr.status
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.company_id = $1 AND lr.status = 'approved'
    `;

    const params = [companyId];

    if (start_date && end_date) {
      query += ` AND lr.start_date <= $2 AND lr.end_date >= $3`;
      params.push(end_date, start_date);
    }

    query += ` ORDER BY lr.start_date`;

    const result = await db.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch leave calendar" });
  }
};

// =====================================================
// GET TEAM LEAVES
// =====================================================
exports.getTeamLeaves = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const result = await db.query(
      `SELECT 
        e.id as employee_id,
        e.first_name,
        e.last_name,
        e.department,
        e.position,
        COUNT(CASE WHEN lr.status = 'pending' THEN 1 END) as pending_requests,
        COUNT(CASE WHEN lr.status = 'approved' AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE THEN 1 END) as currently_on_leave
      FROM employees e
      LEFT JOIN leave_requests lr ON e.id = lr.employee_id
      WHERE e.company_id = $1 AND e.is_active = true
      GROUP BY e.id, e.first_name, e.last_name, e.department, e.position
      ORDER BY e.last_name, e.first_name`,
      [companyId]
    );

    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch team leaves" });
  }
};
