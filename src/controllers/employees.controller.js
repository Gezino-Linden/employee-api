const db = require("../db");
const asyncHandler = require("../utils/asyncHandler");

// GET employees (pagination + search)
exports.getEmployees = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "10", 10), 1),
    50
  );
  const offset = (page - 1) * limit;

  const department = (req.query.department || "").trim();
  const position = (req.query.position || "").trim();
  const search = (req.query.search || "").trim();

  // ✅ active filter
  // default = true (hide soft-deleted)
  const activeParam = (req.query.active || "true").toString().toLowerCase();
  const showAll = activeParam === "all";
  const isActive = activeParam === "false" ? false : true;

  const where = [];
  const values = [];
  let i = 1;

  if (!showAll) {
    values.push(isActive);
    where.push(`is_active = $${i++}`);
  }

  if (department) {
    values.push(department);
    where.push(`department ILIKE $${i++}`);
  }

  if (position) {
    values.push(position);
    where.push(`position ILIKE $${i++}`);
  }

  if (search) {
    values.push(`%${search}%`);
    where.push(
      `(first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR department ILIKE $${i} OR position ILIKE $${i})`
    );
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM employees ${whereSql}`,
    values
  );
  const total = countResult.rows[0].total;

  values.push(limit, offset);

  const listResult = await db.query(
    `SELECT id, first_name, last_name, email, department, position, salary, is_active, created_at
     FROM employees
     ${whereSql}
     ORDER BY id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    values
  );

  return res.json({
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    data: listResult.rows,
  });
});



// GET one employee
exports.getEmployeeById = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  const result = await db.query(
    `SELECT id, first_name, last_name, email, department, position, salary, created_at
     FROM employees WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0)
    return res.status(404).json({ error: "employee not found" });
  res.json(result.rows[0]);
});

// CREATE employee
exports.createEmployee = asyncHandler(async (req, res) => {
  const { first_name, last_name, email, department, position, salary } =
    req.body;

  if (
    !first_name ||
    typeof first_name !== "string" ||
    first_name.trim().length < 2
  ) {
    return res
      .status(400)
      .json({ error: "first_name must be at least 2 characters" });
  }
  if (
    !last_name ||
    typeof last_name !== "string" ||
    last_name.trim().length < 2
  ) {
    return res
      .status(400)
      .json({ error: "last_name must be at least 2 characters" });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (
    !department ||
    typeof department !== "string" ||
    department.trim().length < 2
  ) {
    return res.status(400).json({ error: "department required" });
  }
  if (!position || typeof position !== "string" || position.trim().length < 2) {
    return res.status(400).json({ error: "position required" });
  }

  const salaryNumber = salary === undefined ? 0 : Number(salary);
  if (Number.isNaN(salaryNumber) || salaryNumber < 0) {
    return res.status(400).json({ error: "salary must be a positive number" });
  }

  const result = await db.query(
    `INSERT INTO employees (first_name, last_name, email, department, position, salary)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, first_name, last_name, email, department, position, salary, created_at`,
    [
      first_name.trim(),
      last_name.trim(),
      email.trim().toLowerCase(),
      department.trim(),
      position.trim(),
      salaryNumber,
    ]
  );

  res.status(201).json(result.rows[0]);
});

// UPDATE employee
exports.updateEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  const { first_name, last_name, email, department, position, salary } =
    req.body;

  const fields = [];
  const values = [];
  let idx = 1;

  if (first_name !== undefined) {
    if (typeof first_name !== "string" || first_name.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "first_name must be at least 2 characters" });
    }
    fields.push(`first_name = $${idx++}`);
    values.push(first_name.trim());
  }

  if (last_name !== undefined) {
    if (typeof last_name !== "string" || last_name.trim().length < 2) {
      return res
        .status(400)
        .json({ error: "last_name must be at least 2 characters" });
    }
    fields.push(`last_name = $${idx++}`);
    values.push(last_name.trim());
  }

  if (email !== undefined) {
    if (typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "valid email required" });
    }
    fields.push(`email = $${idx++}`);
    values.push(email.trim().toLowerCase());
  }

  if (department !== undefined) {
    if (typeof department !== "string" || department.trim().length < 2) {
      return res.status(400).json({ error: "department required" });
    }
    fields.push(`department = $${idx++}`);
    values.push(department.trim());
  }

  if (position !== undefined) {
    if (typeof position !== "string" || position.trim().length < 2) {
      return res.status(400).json({ error: "position required" });
    }
    fields.push(`position = $${idx++}`);
    values.push(position.trim());
  }

  if (salary !== undefined) {
    const salaryNumber = Number(salary);
    if (Number.isNaN(salaryNumber) || salaryNumber < 0) {
      return res
        .status(400)
        .json({ error: "salary must be a positive number" });
    }
    fields.push(`salary = $${idx++}`);
    values.push(salaryNumber);
  }

  if (fields.length === 0)
    return res.status(400).json({ error: "nothing to update" });

  values.push(id);

  const result = await db.query(
    `UPDATE employees SET ${fields.join(", ")}
     WHERE id = $${idx}
     RETURNING id, first_name, last_name, email, department, position, salary, created_at`,
    values
  );

  if (result.rows.length === 0)
    return res.status(404).json({ error: "employee not found" });
  res.json(result.rows[0]);
});

// DELETE employee
exports.deleteEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  const result = await db.query(
    `UPDATE employees
     SET is_active = FALSE
     WHERE id = $1 AND is_active = TRUE
     RETURNING id`,
    [id]
  );

  if (result.rows.length === 0) {
    return res
      .status(404)
      .json({ error: "employee not found or already inactive" });
  }

  return res.status(204).send();
});



exports.updateEmployeeSalary = async (req, res) => {
  const employeeId = Number(req.params.id);
  const { salary } = req.body;

  if (!Number.isInteger(employeeId)) {
    return res.status(400).json({ error: "invalid employee id" });
  }

  const newSalary = Number(salary);
  if (!Number.isFinite(newSalary) || newSalary <= 0) {
    return res.status(400).json({ error: "salary must be a positive number" });
  }

  try {
    await db.query("BEGIN");

    // 1) get current salary
    const current = await db.query(
      "SELECT id, salary FROM employees WHERE id = $1",
      [employeeId]
    );

    if (current.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "employee not found" });
    }

    const oldSalary = Number(current.rows[0].salary);

    // 2) update salary
    const updated = await db.query(
      "UPDATE employees SET salary = $1 WHERE id = $2 RETURNING id, first_name, last_name, email, department, position, salary, created_at",
      [newSalary, employeeId]
    );

    // 3) insert audit log
    await db.query(
      `INSERT INTO salary_history (employee_id, old_salary, new_salary, changed_by_user_id)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, oldSalary, newSalary, req.user.id]
    );

    await db.query("COMMIT");
    return res.json(updated.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.log(err);
    return res.status(500).json({ error: "salary update failed" });
  }
};

exports.restoreEmployee = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  const result = await db.query(
    `UPDATE employees
     SET is_active = TRUE
     WHERE id = $1 AND is_active = FALSE
     RETURNING id, first_name, last_name, email, department, position, salary, is_active, created_at`,
    [id]
  );

  if (result.rows.length === 0) {
    return res
      .status(404)
      .json({ error: "employee not found or already active" });
  }

  return res.json(result.rows[0]);
});

