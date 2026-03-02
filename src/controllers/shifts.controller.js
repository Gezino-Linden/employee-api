// File: src/controllers/shifts.controller.js
const db = require("../db");

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Calculate hours between two times (handles overnight shifts)
function calculateHours(startTime, endTime, isOvernightShift = false) {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);

  let hours = endH - startH + (endM - startM) / 60;

  // If negative, shift crosses midnight
  if (hours < 0 || isOvernightShift) {
    hours += 24;
  }

  return Math.max(0, hours);
}

// Calculate night hours (18:00 - 06:00)
function calculateNightHours(clockIn, clockOut) {
  const NIGHT_START = 18; // 6 PM
  const NIGHT_END = 6; // 6 AM

  const clockInDate = new Date(clockIn);
  const clockOutDate = new Date(clockOut);

  let nightHours = 0;
  let currentHour = clockInDate.getHours();
  const totalHours = (clockOutDate - clockInDate) / (1000 * 60 * 60);

  for (let i = 0; i < Math.ceil(totalHours); i++) {
    const hour = (currentHour + i) % 24;

    if (hour >= NIGHT_START || hour < NIGHT_END) {
      nightHours++;
    }
  }

  return Math.min(nightHours, totalHours);
}

// Check if date is a public holiday
async function checkPublicHoliday(date, companyId) {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM public_holidays 
     WHERE date = $1 AND (company_id = $2 OR company_id IS NULL)`,
    [date, companyId]
  );
  return result.rows[0].count > 0;
}

// Check if date is Sunday
function isSunday(date) {
  return new Date(date).getDay() === 0;
}

// =====================================================
// GET SHIFT TEMPLATES
// =====================================================
exports.getShiftTemplates = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const department = req.query.department;
    const active = req.query.active;

    let query = `
      SELECT * FROM shift_templates 
      WHERE company_id = $1
    `;
    const params = [companyId];
    let paramIndex = 1;

    if (department) {
      paramIndex++;
      query += ` AND department = $${paramIndex}`;
      params.push(department);
    }

    if (active !== undefined) {
      paramIndex++;
      query += ` AND is_active = $${paramIndex}`;
      params.push(active === "true");
    }

    query += ` ORDER BY department, start_time`;

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getShiftTemplates:", err);
    return res.status(500).json({
      error: "Failed to fetch shift templates",
      details: err.message,
    });
  }
};

// =====================================================
// CREATE SHIFT TEMPLATE
// =====================================================
exports.createShiftTemplate = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const {
      name,
      code,
      start_time,
      end_time,
      department,
      base_rate_multiplier,
      color,
      notes,
    } = req.body;

    if (!name || !start_time || !end_time) {
      return res.status(400).json({
        error: "Name, start_time, and end_time are required",
      });
    }

    // Calculate duration and check if overnight
    const isOvernightShift = end_time < start_time;
    const duration = calculateHours(start_time, end_time, isOvernightShift);

    const result = await db.query(
      `INSERT INTO shift_templates (
        company_id, name, code, start_time, end_time, duration_hours,
        department, base_rate_multiplier, is_night_shift, color, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        companyId,
        name,
        code || name.substring(0, 3).toUpperCase(),
        start_time,
        end_time,
        duration,
        department,
        base_rate_multiplier || 1.0,
        isOvernightShift,
        color || "#6366f1",
        notes,
      ]
    );

    return res.json({
      message: "Shift template created successfully",
      template: result.rows[0],
    });
  } catch (err) {
    console.error("ERROR in createShiftTemplate:", err);
    return res.status(500).json({
      error: "Failed to create shift template",
      details: err.message,
    });
  }
};

// =====================================================
// UPDATE SHIFT TEMPLATE
// =====================================================
exports.updateShiftTemplate = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const templateId = toInt(req.params.id, 0);
    const updates = req.body;

    if (!templateId) {
      return res.status(400).json({ error: "Invalid template ID" });
    }

    // Check ownership
    const check = await db.query(
      `SELECT * FROM shift_templates WHERE id = $1 AND company_id = $2`,
      [templateId, companyId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Shift template not found" });
    }

    const current = check.rows[0];

    // Recalculate duration if times changed
    let duration = current.duration_hours;
    let isOvernightShift = current.is_night_shift;

    if (updates.start_time || updates.end_time) {
      const startTime = updates.start_time || current.start_time;
      const endTime = updates.end_time || current.end_time;
      isOvernightShift = endTime < startTime;
      duration = calculateHours(startTime, endTime, isOvernightShift);
    }

    const result = await db.query(
      `UPDATE shift_templates SET
        name = COALESCE($1, name),
        code = COALESCE($2, code),
        start_time = COALESCE($3, start_time),
        end_time = COALESCE($4, end_time),
        duration_hours = $5,
        department = COALESCE($6, department),
        base_rate_multiplier = COALESCE($7, base_rate_multiplier),
        is_night_shift = $8,
        color = COALESCE($9, color),
        is_active = COALESCE($10, is_active),
        notes = COALESCE($11, notes),
        updated_at = NOW()
      WHERE id = $12
      RETURNING *`,
      [
        updates.name,
        updates.code,
        updates.start_time,
        updates.end_time,
        duration,
        updates.department,
        updates.base_rate_multiplier,
        isOvernightShift,
        updates.color,
        updates.is_active,
        updates.notes,
        templateId,
      ]
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in updateShiftTemplate:", err);
    return res.status(500).json({
      error: "Failed to update shift template",
      details: err.message,
    });
  }
};

// =====================================================
// ASSIGN SHIFT TO EMPLOYEE
// =====================================================
exports.assignShift = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { employee_id, shift_template_id, shift_date, break_minutes, notes } =
      req.body;

    if (!employee_id || !shift_template_id || !shift_date) {
      return res.status(400).json({
        error: "employee_id, shift_template_id, and shift_date are required",
      });
    }

    // Get shift template details
    const template = await db.query(
      `SELECT * FROM shift_templates WHERE id = $1 AND company_id = $2`,
      [shift_template_id, companyId]
    );

    if (template.rows.length === 0) {
      return res.status(404).json({ error: "Shift template not found" });
    }

    // Get employee hourly rate
    const employee = await db.query(
      `SELECT salary, hourly_rate FROM employees WHERE id = $1 AND company_id = $2`,
      [employee_id, companyId]
    );

    if (employee.rows.length === 0) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const shift = template.rows[0];
    const emp = employee.rows[0];

    // Calculate hourly rate if not set
    let hourlyRate = emp.hourly_rate;
    if (!hourlyRate && emp.salary) {
      // Assume 160 hours per month (40 hours * 4 weeks)
      hourlyRate = emp.salary / 160;
    }

    // Calculate base pay
    const workingHours = shift.duration_hours - (break_minutes || 30) / 60;
    const basePay = hourlyRate * workingHours * shift.base_rate_multiplier;

    const result = await db.query(
      `INSERT INTO employee_shifts (
        company_id, employee_id, shift_template_id, shift_date,
        start_time, end_time, break_minutes, base_pay, total_pay,
        status, assigned_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        companyId,
        employee_id,
        shift_template_id,
        shift_date,
        shift.start_time,
        shift.end_time,
        break_minutes || 30,
        basePay,
        basePay, // Will be updated after shift is completed
        "scheduled",
        req.user.id,
        notes,
      ]
    );

    return res.json({
      message: "Shift assigned successfully",
      shift: result.rows[0],
    });
  } catch (err) {
    console.error("ERROR in assignShift:", err);

    if (err.code === "23505") {
      // Unique constraint violation
      return res.status(409).json({
        error: "Employee already has a shift assigned for this date",
      });
    }

    return res.status(500).json({
      error: "Failed to assign shift",
      details: err.message,
    });
  }
};

// =====================================================
// BULK ASSIGN SHIFTS
// =====================================================
exports.bulkAssignShifts = async (req, res) => {
  let client;
  try {
    const companyId = req.user.company_id;
    const { assignments } = req.body;

    // assignments: [{ employee_id, shift_template_id, shift_date, break_minutes }]

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        error: "assignments array is required",
      });
    }

    client = await db.connect();
    await client.query("BEGIN");

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        // Get shift template
        const template = await client.query(
          `SELECT * FROM shift_templates WHERE id = $1 AND company_id = $2`,
          [assignment.shift_template_id, companyId]
        );

        if (template.rows.length === 0) {
          errors.push({
            assignment,
            error: "Shift template not found",
          });
          continue;
        }

        // Get employee
        const employee = await client.query(
          `SELECT salary, hourly_rate FROM employees WHERE id = $1 AND company_id = $2`,
          [assignment.employee_id, companyId]
        );

        if (employee.rows.length === 0) {
          errors.push({
            assignment,
            error: "Employee not found",
          });
          continue;
        }

        const shift = template.rows[0];
        const emp = employee.rows[0];

        let hourlyRate = emp.hourly_rate || emp.salary / 160;
        const workingHours =
          shift.duration_hours - (assignment.break_minutes || 30) / 60;
        const basePay = hourlyRate * workingHours * shift.base_rate_multiplier;

        const result = await client.query(
          `INSERT INTO employee_shifts (
            company_id, employee_id, shift_template_id, shift_date,
            start_time, end_time, break_minutes, base_pay, total_pay,
            status, assigned_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (company_id, employee_id, shift_date, shift_template_id) DO NOTHING
          RETURNING *`,
          [
            companyId,
            assignment.employee_id,
            assignment.shift_template_id,
            assignment.shift_date,
            shift.start_time,
            shift.end_time,
            assignment.break_minutes || 30,
            basePay,
            basePay,
            "scheduled",
            req.user.id,
          ]
        );

        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        } else {
          errors.push({
            assignment,
            error: "Shift already exists (skipped)",
          });
        }
      } catch (err) {
        errors.push({
          assignment,
          error: err.message,
        });
      }
    }

    await client.query("COMMIT");

    return res.json({
      message: `Assigned ${results.length} shifts`,
      assigned: results.length,
      skipped: errors.length,
      shifts: results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("ERROR in bulkAssignShifts:", err);
    return res.status(500).json({
      error: "Failed to bulk assign shifts",
      details: err.message,
    });
  } finally {
    if (client) client.release();
  }
};

// =====================================================
// GET EMPLOYEE SHIFTS
// =====================================================
exports.getEmployeeShifts = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const employeeId = toInt(req.query.employee_id, 0);
    const startDate = req.query.start_date;
    const endDate = req.query.end_date;
    const status = req.query.status;

    let query = `
      SELECT 
        es.*,
        st.name as shift_name,
        st.code as shift_code,
        st.color as shift_color,
        st.department,
        e.first_name,
        e.last_name,
        e.email
      FROM employee_shifts es
      JOIN shift_templates st ON es.shift_template_id = st.id
      JOIN employees e ON es.employee_id = e.id
      WHERE es.company_id = $1
    `;

    const params = [companyId];
    let paramIndex = 1;

    if (employeeId > 0) {
      paramIndex++;
      query += ` AND es.employee_id = $${paramIndex}`;
      params.push(employeeId);
    }

    if (startDate) {
      paramIndex++;
      query += ` AND es.shift_date >= $${paramIndex}`;
      params.push(startDate);
    }

    if (endDate) {
      paramIndex++;
      query += ` AND es.shift_date <= $${paramIndex}`;
      params.push(endDate);
    }

    if (status) {
      paramIndex++;
      query += ` AND es.status = $${paramIndex}`;
      params.push(status);
    }

    query += ` ORDER BY es.shift_date DESC, es.start_time`;

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getEmployeeShifts:", err);
    return res.status(500).json({
      error: "Failed to fetch employee shifts",
      details: err.message,
    });
  }
};

// =====================================================
// UPDATE SHIFT (Status, Times, Pay)
// =====================================================
exports.updateShift = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const shiftId = toInt(req.params.id, 0);
    const updates = req.body;

    if (!shiftId) {
      return res.status(400).json({ error: "Invalid shift ID" });
    }

    const result = await db.query(
      `UPDATE employee_shifts SET
        status = COALESCE($1, status),
        actual_start_time = COALESCE($2, actual_start_time),
        actual_end_time = COALESCE($3, actual_end_time),
        actual_hours_worked = COALESCE($4, actual_hours_worked),
        shift_premium = COALESCE($5, shift_premium),
        overtime_pay = COALESCE($6, overtime_pay),
        total_pay = COALESCE($7, total_pay),
        notes = COALESCE($8, notes),
        updated_at = NOW()
      WHERE id = $9 AND company_id = $10
      RETURNING *`,
      [
        updates.status,
        updates.actual_start_time,
        updates.actual_end_time,
        updates.actual_hours_worked,
        updates.shift_premium,
        updates.overtime_pay,
        updates.total_pay,
        updates.notes,
        shiftId,
        companyId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR in updateShift:", err);
    return res.status(500).json({
      error: "Failed to update shift",
      details: err.message,
    });
  }
};

// =====================================================
// DELETE SHIFT
// =====================================================
exports.deleteShift = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const shiftId = toInt(req.params.id, 0);

    if (!shiftId) {
      return res.status(400).json({ error: "Invalid shift ID" });
    }

    const result = await db.query(
      `DELETE FROM employee_shifts 
       WHERE id = $1 AND company_id = $2
       RETURNING id`,
      [shiftId, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Shift not found" });
    }

    return res.json({
      message: "Shift deleted successfully",
      id: shiftId,
    });
  } catch (err) {
    console.error("ERROR in deleteShift:", err);
    return res.status(500).json({
      error: "Failed to delete shift",
      details: err.message,
    });
  }
};

// =====================================================
// GET SHIFT CALENDAR (For specific date range)
// =====================================================
exports.getShiftCalendar = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const { start_date, end_date, department } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: "start_date and end_date are required",
      });
    }

    let query = `
      SELECT 
        es.id,
        es.shift_date,
        es.start_time,
        es.end_time,
        es.status,
        es.employee_id,
        e.first_name,
        e.last_name,
        e.department,
        st.name as shift_name,
        st.code as shift_code,
        st.color as shift_color
      FROM employee_shifts es
      JOIN employees e ON es.employee_id = e.id
      JOIN shift_templates st ON es.shift_template_id = st.id
      WHERE es.company_id = $1
        AND es.shift_date >= $2
        AND es.shift_date <= $3
    `;

    const params = [companyId, start_date, end_date];
    let paramIndex = 3;

    if (department) {
      paramIndex++;
      query += ` AND e.department = $${paramIndex}`;
      params.push(department);
    }

    query += ` ORDER BY es.shift_date, es.start_time, e.last_name`;

    const result = await db.query(query, params);

    return res.json(result.rows);
  } catch (err) {
    console.error("ERROR in getShiftCalendar:", err);
    return res.status(500).json({
      error: "Failed to fetch shift calendar",
      details: err.message,
    });
  }
};

module.exports = exports;
