// File: src/controllers/attendance.controller.js
const db = require("../db");

// =====================================================
// HELPERS
// =====================================================
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Calculate hours between two timestamps (minus break)
function calcHours(clockIn, clockOut, breakMinutes = 0) {
  if (!clockIn || !clockOut) return 0;
  const ms = new Date(clockOut) - new Date(clockIn);
  const totalMinutes = ms / 60000 - breakMinutes;
  return Math.max(0, Math.round(totalMinutes) / 60);
}

// Calculate late minutes
function calcLateMinutes(clockIn, expectedStart) {
  if (!clockIn) return 0;
  const ci = new Date(clockIn);
  const [h, m] = expectedStart.split(":").map(Number);
  const expected = new Date(ci);
  expected.setHours(h, m, 0, 0);
  const diff = ci - expected;
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

// Calculate early departure minutes
function calcEarlyDeparture(clockOut, expectedEnd) {
  if (!clockOut) return 0;
  const co = new Date(clockOut);
  const [h, m] = expectedEnd.split(":").map(Number);
  const expected = new Date(co);
  expected.setHours(h, m, 0, 0);
  const diff = expected - co;
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

// Determine status from attendance data
function determineStatus(clockIn, totalHours, lateMinutes, expectedHours) {
  if (!clockIn) return "absent";
  if (totalHours >= expectedHours * 0.5 && totalHours < expectedHours * 0.9)
    return "half_day";
  if (lateMinutes > 15) return "late";
  return "present";
}

// =====================================================
// CLOCK IN
// =====================================================
exports.clockIn = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;

    // Admin can clock in on behalf of employee, otherwise use own employee_id
    let employeeId = req.user?.employee_id;
    if (
      (requesterRole === "admin" || requesterRole === "manager") &&
      req.body.employee_id
    ) {
      employeeId = toInt(req.body.employee_id, employeeId);
    }

    if (!companyId || !employeeId) {
      return res.status(400).json({ error: "Company or employee ID missing" });
    }

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    // Check if already clocked in today
    const existing = await db.query(
      `SELECT * FROM attendance_records WHERE company_id = $1 AND employee_id = $2 AND date = $3`,
      [companyId, employeeId, today]
    );

    if (existing.rows.length > 0 && existing.rows[0].clock_in) {
      return res.status(409).json({ error: "Already clocked in today" });
    }

    // Get employee's expected hours and hourly rate
    const empResult = await db.query(
      `SELECT salary FROM employees WHERE id = $1 AND company_id = $2`,
      [employeeId, companyId]
    );

    const basicSalary = empResult.rows[0]?.salary || 0;
    const hourlyRate = basicSalary > 0 ? basicSalary / (22 * 8) : 0; // ~22 working days, 8hrs/day

    const expectedStart = req.body.expected_start || "08:00";
    const expectedEnd = req.body.expected_end || "17:00";
    const lateMinutes = calcLateMinutes(now, expectedStart);

    if (existing.rows.length > 0) {
      // Update existing record
      const result = await db.query(
        `UPDATE attendance_records
         SET clock_in = $1, status = 'present', late_minutes = $2,
             expected_start = $3, expected_end = $4, hourly_rate = $5,
             updated_at = NOW()
         WHERE company_id = $6 AND employee_id = $7 AND date = $8
         RETURNING *`,
        [
          now,
          lateMinutes,
          expectedStart,
          expectedEnd,
          hourlyRate,
          companyId,
          employeeId,
          today,
        ]
      );
      return res.json(result.rows[0]);
    } else {
      // Create new record
      const result = await db.query(
        `INSERT INTO attendance_records
         (company_id, employee_id, date, clock_in, status, late_minutes,
          expected_start, expected_end, hourly_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          companyId,
          employeeId,
          today,
          now,
          lateMinutes > 15 ? "late" : "present",
          lateMinutes,
          expectedStart,
          expectedEnd,
          hourlyRate,
        ]
      );
      return res.json(result.rows[0]);
    }
  } catch (err) {
    console.error("ERROR in clockIn:", err);
    return res
      .status(500)
      .json({ error: "Failed to clock in", details: err.message });
  }
};

// =====================================================
// START BREAK
// =====================================================
exports.startBreak = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    let employeeId = req.user?.employee_id;
    if (
      (req.user?.role === "admin" || req.user?.role === "manager") &&
      req.body.employee_id
    ) {
      employeeId = toInt(req.body.employee_id, employeeId);
    }

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const result = await db.query(
      `UPDATE attendance_records
       SET break_start = $1, updated_at = NOW()
       WHERE company_id = $2 AND employee_id = $3 AND date = $4
         AND clock_in IS NOT NULL AND clock_out IS NULL AND break_start IS NULL
       RETURNING *`,
      [now, companyId, employeeId, today]
    );

    if (result.rows.length === 0) {
      return res
        .status(400)
        .json({ error: "No active clock-in found or break already started" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in startBreak:", err);
    return res
      .status(500)
      .json({ error: "Failed to start break", details: err.message });
  }
};

// =====================================================
// END BREAK
// =====================================================
exports.endBreak = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    let employeeId = req.user?.employee_id;
    if (
      (req.user?.role === "admin" || req.user?.role === "manager") &&
      req.body.employee_id
    ) {
      employeeId = toInt(req.body.employee_id, employeeId);
    }

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const existing = await db.query(
      `SELECT * FROM attendance_records
       WHERE company_id = $1 AND employee_id = $2 AND date = $3`,
      [companyId, employeeId, today]
    );

    if (existing.rows.length === 0 || !existing.rows[0].break_start) {
      return res.status(400).json({ error: "No break in progress" });
    }

    const record = existing.rows[0];
    const breakMs = now - new Date(record.break_start);
    const newBreakMinutes =
      (record.total_break_minutes || 0) + Math.round(breakMs / 60000);

    const result = await db.query(
      `UPDATE attendance_records
       SET break_end = $1, total_break_minutes = $2, break_start = NULL, updated_at = NOW()
       WHERE company_id = $3 AND employee_id = $4 AND date = $5
       RETURNING *`,
      [now, newBreakMinutes, companyId, employeeId, today]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in endBreak:", err);
    return res
      .status(500)
      .json({ error: "Failed to end break", details: err.message });
  }
};

// =====================================================
// CLOCK OUT
// =====================================================
exports.clockOut = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    let employeeId = req.user?.employee_id;
    if (
      (req.user?.role === "admin" || req.user?.role === "manager") &&
      req.body.employee_id
    ) {
      employeeId = toInt(req.body.employee_id, employeeId);
    }

    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const existing = await db.query(
      `SELECT * FROM attendance_records
       WHERE company_id = $1 AND employee_id = $2 AND date = $3`,
      [companyId, employeeId, today]
    );

    if (existing.rows.length === 0 || !existing.rows[0].clock_in) {
      return res
        .status(400)
        .json({ error: "No clock-in record found for today" });
    }

    if (existing.rows[0].clock_out) {
      return res.status(409).json({ error: "Already clocked out today" });
    }

    const record = existing.rows[0];
    const totalHours = calcHours(
      record.clock_in,
      now,
      record.total_break_minutes || 0
    );
    const overtimeHours = Math.max(
      0,
      totalHours - (record.expected_hours || 8)
    );
    const earlyDeparture = calcEarlyDeparture(
      now,
      record.expected_end || "17:00"
    );
    const status = determineStatus(
      record.clock_in,
      totalHours,
      record.late_minutes || 0,
      record.expected_hours || 8
    );

    const hourlyRate = parseFloat(record.hourly_rate) || 0;
    const dailyPay = totalHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * 1.5; // 1.5x SA labour law

    const result = await db.query(
      `UPDATE attendance_records
       SET clock_out = $1,
           total_hours = $2,
           overtime_hours = $3,
           early_departure_minutes = $4,
           status = $5,
           daily_pay = $6,
           overtime_pay = $7,
           updated_at = NOW()
       WHERE company_id = $8 AND employee_id = $9 AND date = $10
       RETURNING *`,
      [
        now,
        totalHours,
        overtimeHours,
        earlyDeparture,
        status,
        dailyPay,
        overtimePay,
        companyId,
        employeeId,
        today,
      ]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in clockOut:", err);
    return res
      .status(500)
      .json({ error: "Failed to clock out", details: err.message });
  }
};

// =====================================================
// GET TODAY'S STATUS (for clock widget)
// =====================================================
exports.getTodayStatus = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    let employeeId = req.user?.employee_id;
    if (
      (req.user?.role === "admin" || req.user?.role === "manager") &&
      req.query.employee_id
    ) {
      employeeId = toInt(req.query.employee_id, employeeId);
    }

    const today = new Date().toISOString().split("T")[0];

    const result = await db.query(
      `SELECT ar.*, e.first_name, e.last_name
       FROM attendance_records ar
       JOIN employees e ON ar.employee_id = e.id
       WHERE ar.company_id = $1 AND ar.employee_id = $2 AND ar.date = $3`,
      [companyId, employeeId, today]
    );

    if (result.rows.length === 0) {
      return res.json({ status: "not_clocked_in", date: today });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in getTodayStatus:", err);
    return res
      .status(500)
      .json({ error: "Failed to get today status", details: err.message });
  }
};

// =====================================================
// GET ATTENDANCE RECORDS (admin view)
// =====================================================
exports.getAttendanceRecords = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const date = req.query.date || new Date().toISOString().split("T")[0];
    const employeeId = toInt(req.query.employee_id, 0);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const status = req.query.status;
    const page = toInt(req.query.page, 1);
    const perPage = Math.min(toInt(req.query.per_page, 50), 100);
    const offset = (page - 1) * perPage;

    let query = `
      SELECT
        ar.*,
        e.first_name,
        e.last_name,
        e.email,
        e.department,
        e.position
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.company_id = $1
    `;

    const params = [companyId];
    let paramIndex = 1;

    if (startDate && endDate) {
      paramIndex++;
      query += ` AND ar.date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
      query += ` AND ar.date <= $${paramIndex}`;
      params.push(endDate);
    } else {
      paramIndex++;
      query += ` AND ar.date = $${paramIndex}`;
      params.push(date);
    }

    if (employeeId > 0) {
      paramIndex++;
      query += ` AND ar.employee_id = $${paramIndex}`;
      params.push(employeeId);
    }

    if (status) {
      paramIndex++;
      query += ` AND ar.status = $${paramIndex}`;
      params.push(status);
    }

    query += ` ORDER BY e.last_name, e.first_name`;

    paramIndex++;
    query += ` LIMIT $${paramIndex}`;
    params.push(perPage);

    paramIndex++;
    query += ` OFFSET $${paramIndex}`;
    params.push(offset);

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getAttendanceRecords:", err);
    return res
      .status(500)
      .json({
        error: "Failed to get attendance records",
        details: err.message,
      });
  }
};

// =====================================================
// GET ATTENDANCE SUMMARY (for dashboard)
// =====================================================
exports.getAttendanceSummary = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const date = req.query.date || new Date().toISOString().split("T")[0];

    const result = await db.query(
      `SELECT
        CAST(COUNT(*) AS INTEGER) as total_records,
        CAST(COUNT(CASE WHEN status = 'present' THEN 1 END) AS INTEGER) as present,
        CAST(COUNT(CASE WHEN status = 'absent' THEN 1 END) AS INTEGER) as absent,
        CAST(COUNT(CASE WHEN status = 'late' THEN 1 END) AS INTEGER) as late,
        CAST(COUNT(CASE WHEN status = 'half_day' THEN 1 END) AS INTEGER) as half_day,
        CAST(COUNT(CASE WHEN clock_in IS NOT NULL AND clock_out IS NULL THEN 1 END) AS INTEGER) as currently_clocked_in,
        COALESCE(SUM(total_hours), 0) as total_hours_worked,
        COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
        COALESCE(SUM(daily_pay), 0) as total_daily_cost,
        COALESCE(SUM(overtime_pay), 0) as total_overtime_cost
       FROM attendance_records
       WHERE company_id = $1 AND date = $2`,
      [companyId, date]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in getAttendanceSummary:", err);
    return res
      .status(500)
      .json({
        error: "Failed to get attendance summary",
        details: err.message,
      });
  }
};

// =====================================================
// ADMIN OVERRIDE - manually set attendance
// =====================================================
exports.adminOverride = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const overrideBy = req.user?.id;
    const role = req.user?.role;

    if (role !== "admin" && role !== "manager") {
      return res.status(403).json({ error: "Admin or manager role required" });
    }

    const { employee_id, date, clock_in, clock_out, status, notes } = req.body;

    if (!employee_id || !date) {
      return res
        .status(400)
        .json({ error: "employee_id and date are required" });
    }

    const empResult = await db.query(
      `SELECT salary FROM employees WHERE id = $1 AND company_id = $2`,
      [employee_id, companyId]
    );
    const basicSalary = empResult.rows[0]?.salary || 0;
    const hourlyRate = basicSalary > 0 ? basicSalary / (22 * 8) : 0;

    const clockInDate = clock_in ? new Date(clock_in) : null;
    const clockOutDate = clock_out ? new Date(clock_out) : null;
    const totalHours = calcHours(clockInDate, clockOutDate, 0);
    const overtimeHours = Math.max(0, totalHours - 8);
    const dailyPay = totalHours * hourlyRate;
    const overtimePay = overtimeHours * hourlyRate * 1.5;

    const result = await db.query(
      `INSERT INTO attendance_records
       (company_id, employee_id, date, clock_in, clock_out, status,
        total_hours, overtime_hours, daily_pay, overtime_pay,
        hourly_rate, notes, override_by, override_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
       ON CONFLICT (company_id, employee_id, date)
       DO UPDATE SET
         clock_in = EXCLUDED.clock_in,
         clock_out = EXCLUDED.clock_out,
         status = EXCLUDED.status,
         total_hours = EXCLUDED.total_hours,
         overtime_hours = EXCLUDED.overtime_hours,
         daily_pay = EXCLUDED.daily_pay,
         overtime_pay = EXCLUDED.overtime_pay,
         notes = EXCLUDED.notes,
         override_by = EXCLUDED.override_by,
         override_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        companyId,
        employee_id,
        date,
        clockInDate,
        clockOutDate,
        status || "present",
        totalHours,
        overtimeHours,
        dailyPay,
        overtimePay,
        hourlyRate,
        notes,
        overrideBy,
      ]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in adminOverride:", err);
    return res
      .status(500)
      .json({ error: "Failed to override attendance", details: err.message });
  }
};

// =====================================================
// GET MONTHLY REPORT (for payroll linkage)
// =====================================================
exports.getMonthlyReport = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId)
      return res.status(400).json({ error: "Company ID not found" });

    const month = toInt(req.query.month, new Date().getMonth() + 1);
    const year = toInt(req.query.year, new Date().getFullYear());
    const employeeId = toInt(req.query.employee_id, 0);

    let query = `
      SELECT
        ar.employee_id,
        e.first_name,
        e.last_name,
        e.department,
        CAST(COUNT(*) AS INTEGER) as days_recorded,
        CAST(COUNT(CASE WHEN ar.status = 'present' THEN 1 END) AS INTEGER) as days_present,
        CAST(COUNT(CASE WHEN ar.status = 'absent' THEN 1 END) AS INTEGER) as days_absent,
        CAST(COUNT(CASE WHEN ar.status = 'late' THEN 1 END) AS INTEGER) as days_late,
        CAST(COUNT(CASE WHEN ar.status = 'half_day' THEN 1 END) AS INTEGER) as days_half,
        COALESCE(SUM(ar.total_hours), 0) as total_hours,
        COALESCE(SUM(ar.overtime_hours), 0) as total_overtime,
        COALESCE(SUM(ar.total_break_minutes), 0) as total_break_minutes,
        COALESCE(SUM(ar.daily_pay), 0) as total_pay,
        COALESCE(SUM(ar.overtime_pay), 0) as total_overtime_pay,
        COALESCE(AVG(ar.late_minutes) FILTER (WHERE ar.late_minutes > 0), 0) as avg_late_minutes
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.company_id = $1
        AND EXTRACT(MONTH FROM ar.date) = $2
        AND EXTRACT(YEAR FROM ar.date) = $3
    `;

    const params = [companyId, month, year];

    if (employeeId > 0) {
      query += ` AND ar.employee_id = $4`;
      params.push(employeeId);
    }

    query += ` GROUP BY ar.employee_id, e.first_name, e.last_name, e.department
               ORDER BY e.last_name, e.first_name`;

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getMonthlyReport:", err);
    return res
      .status(500)
      .json({ error: "Failed to get monthly report", details: err.message });
  }
};
