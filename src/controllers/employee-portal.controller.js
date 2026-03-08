// File: src/controllers/employee-portal.controller.js
const db = require("../db");
const asyncHandler = require("../utils/asyncHandler");

// â”€â”€ ATTENDANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.getTodayStatus = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT * FROM attendance_records
     WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE
     ORDER BY clock_in DESC LIMIT 1`,
    [req.employee.id]
  );
  return res.json({ data: result.rows[0] || null });
});

exports.clockIn = asyncHandler(async (req, res) => {
  const existing = await db.query(
    `SELECT id FROM attendance_records
     WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE AND clock_out IS NULL`,
    [req.employee.id]
  );
  if (existing.rows.length)
    return res.status(400).json({ error: "Already clocked in today" });

  await db.query(
    `INSERT INTO attendance_records (employee_id, company_id, clock_in, status)
     VALUES ($1, $2, NOW(), 'present')`,
    [req.employee.id, req.employee.company_id]
  );
  return res.json({ message: "Clocked in successfully" });
});

exports.clockOut = asyncHandler(async (req, res) => {
  const rec = await db.query(
    `SELECT id, clock_in FROM attendance_records
     WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE AND clock_out IS NULL`,
    [req.employee.id]
  );
  if (!rec.rows.length)
    return res.status(400).json({ error: "Not clocked in" });

  await db.query(
    `UPDATE attendance_records
     SET clock_out = NOW(),
         hours_worked = ROUND(EXTRACT(EPOCH FROM (NOW() - clock_in))/3600, 2)
     WHERE id = $1`,
    [rec.rows[0].id]
  );
  return res.json({ message: "Clocked out successfully" });
});

exports.startBreak = asyncHandler(async (req, res) => {
  const rec = await db.query(
    `SELECT id FROM attendance_records
     WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE AND clock_out IS NULL`,
    [req.employee.id]
  );
  if (!rec.rows.length)
    return res.status(400).json({ error: "Not clocked in" });

  await db.query(
    `UPDATE attendance_records
     SET break_start = NOW()
     WHERE id = $1`,
    [rec.rows[0].id]
  );
  return res.json({ message: "Break started" });
});

exports.endBreak = asyncHandler(async (req, res) => {
  const rec = await db.query(
    `SELECT id, break_start FROM attendance_records
     WHERE employee_id = $1 AND DATE(clock_in) = CURRENT_DATE
       AND clock_out IS NULL AND break_start IS NOT NULL`,
    [req.employee.id]
  );
  if (!rec.rows.length)
    return res.status(400).json({ error: "Not currently on break" });

  await db.query(
    `UPDATE attendance_records
     SET status = 'present',
         total_break_minutes = COALESCE(total_break_minutes, 0) +
           ROUND(EXTRACT(EPOCH FROM (NOW() - break_start)) / 60),
         break_start = NULL, break_end = NOW()
     WHERE id = $1`,
    [rec.rows[0].id]
  );
  return res.json({ message: "Break ended" });
});

// â”€â”€ LEAVE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.getLeaveBalances = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT lb.*, lt.name AS leave_type_name
     FROM leave_balances lb
     JOIN leave_types lt ON lt.id = lb.leave_type_id
     WHERE lb.employee_id = $1 AND lb.year = EXTRACT(YEAR FROM NOW())`,
    [req.employee.id]
  );
  return res.json({ data: result.rows });
});

exports.getLeaveTypes = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, name, default_days_per_year FROM leave_types
     WHERE is_active = true ORDER BY name`,
    []
  );
  return res.json({ data: result.rows });
});

exports.getMyLeaveRequests = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT lr.*, lt.name AS leave_type_name
     FROM leave_requests lr
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.employee_id = $1
     ORDER BY lr.created_at DESC LIMIT 20`,
    [req.employee.id]
  );
  return res.json({ data: result.rows });
});

exports.submitLeaveRequest = asyncHandler(async (req, res) => {
  const { leave_type_id, start_date, end_date, reason } = req.body;
  if (!leave_type_id || !start_date || !end_date)
    return res
      .status(400)
      .json({ error: "leave_type_id, start_date and end_date are required" });

  const days =
    Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000) + 1;

  if (days < 1)
    return res.status(400).json({ error: "End date must be after start date" });

  await db.query(
    `INSERT INTO leave_requests
       (employee_id, company_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [
      req.employee.id,
      req.employee.company_id,
      leave_type_id,
      start_date,
      end_date,
      days,
      reason || null,
    ]
  );
  return res.status(201).json({ message: "Leave request submitted" });
});

exports.cancelLeaveRequest = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  const result = await db.query(
    `UPDATE leave_requests SET status = 'cancelled'
     WHERE id = $1 AND employee_id = $2 AND status = 'pending'
     RETURNING id`,
    [id, req.employee.id]
  );
  if (!result.rows.length)
    return res
      .status(404)
      .json({ error: "Request not found or already processed" });

  return res.json({ message: "Leave request cancelled" });
});

// â”€â”€ SHIFTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.getMyShifts = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT sa.*, st.name AS template_name, st.start_time, st.end_time
     FROM shift_assignments sa
     JOIN shift_templates st ON st.id = sa.shift_template_id
     WHERE sa.employee_id = $1 AND sa.shift_date >= CURRENT_DATE
     ORDER BY sa.shift_date ASC LIMIT 14`,
    [req.employee.id]
  );
  return res.json({ data: result.rows });
});

// â”€â”€ PAYSLIPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

exports.getMyPayslips = asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT id, month, year, gross_pay, net_pay, status, created_at
     FROM payroll_records
     WHERE employee_id = $1
     ORDER BY year DESC, month DESC LIMIT 24`,
    [req.employee.id]
  );
  return res.json({ data: result.rows });
});
exports.downloadPayslip = asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const result = await db.query(
    "SELECT * FROM payroll_records WHERE id = $1 AND employee_id = $2",
    [id, req.employee.id]
  );
  if (!result.rows.length)
    return res.status(404).json({ error: "Payslip not found" });
  return res.json({ data: result.rows[0] });
});



