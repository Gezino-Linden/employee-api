const db = require("../db");

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

exports.getEmployees = async (req, res) => {
  const companyId = req.user.company_id;

  const page = Math.max(toInt(req.query.page, 1), 1);
  const limit = Math.min(Math.max(toInt(req.query.limit, 10), 1), 50);
  const offset = (page - 1) * limit;

  const search = (req.query.search || "").trim();
  const department = (req.query.department || "").trim();
  const position = (req.query.position || "").trim();

  // active=true/false filter
  let active = req.query.active;
  if (typeof active === "string") {
    active = active.toLowerCase();
    if (active === "true") active = true;
    else if (active === "false") active = false;
    else active = undefined;
  }

  const where = [`company_id = $1`];
  const params = [companyId];
  let i = 2;

  if (search) {
    where.push(
      `(first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR department ILIKE $${i} OR position ILIKE $${i})`
    );
    params.push(`%${search}%`);
    i++;
  }
  if (department) {
    where.push(`department = $${i}`);
    params.push(department);
    i++;
  }
  if (position) {
    where.push(`position = $${i}`);
    params.push(position);
    i++;
  }
  if (typeof active === "boolean") {
    where.push(`is_active = $${i}`);
    params.push(active);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total FROM employees ${whereSql}`,
    params
  );
  const total = countRes.rows[0].total;

  params.push(limit, offset);

  const listRes = await db.query(
    `SELECT id, first_name, last_name, email, department, position,
            ROUND(salary, 2) AS salary, is_active, created_at, company_id
     FROM employees
     ${whereSql}
     ORDER BY id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data: listRes.rows.map((r) => ({
      ...r,
      salary: Number(r.salary),
    })),
  });
};

exports.getEmployeeById = async (req, res) => {
  const companyId = req.user.company_id;
  const id = toInt(req.params.id, 0);

  const result = await db.query(
    `SELECT id, first_name, last_name, email, department, position,
            ROUND(salary, 2) AS salary, is_active, created_at, company_id
     FROM employees
     WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "employee not found" });
  }

  const emp = result.rows[0];
  emp.salary = Number(emp.salary);
  return res.json(emp);
};

exports.createEmployee = async (req, res) => {
  const companyId = req.user.company_id;
  const { first_name, last_name, email, department, position, salary } =
    req.body;

  if (!first_name || !last_name || !email || !department || !position) {
    return res.status(400).json({ error: "missing required fields" });
  }

  const result = await db.query(
    `INSERT INTO employees
      (first_name, last_name, email, department, position, salary, company_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, first_name, last_name, email, department, position,
               ROUND(salary, 2) AS salary, is_active, created_at, company_id`,
    [
      String(first_name).trim(),
      String(last_name).trim(),
      String(email).trim().toLowerCase(),
      String(department).trim(),
      String(position).trim(),
      salary ?? 0,
      companyId,
    ]
  );

  const emp = result.rows[0];
  emp.salary = Number(emp.salary);
  return res.status(201).json(emp);
};

exports.updateEmployee = async (req, res) => {
  const companyId = req.user.company_id;
  const id = toInt(req.params.id, 0);
  const { first_name, last_name, email, department, position } = req.body;

  const result = await db.query(
    `UPDATE employees
     SET first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         email      = COALESCE($3, email),
         department = COALESCE($4, department),
         position   = COALESCE($5, position)
     WHERE id = $6 AND company_id = $7
     RETURNING id, first_name, last_name, email, department, position,
               ROUND(salary, 2) AS salary, is_active, created_at, company_id`,
    [
      first_name ?? null,
      last_name ?? null,
      email ? String(email).trim().toLowerCase() : null,
      department ?? null,
      position ?? null,
      id,
      companyId,
    ]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "employee not found" });
  }

  const emp = result.rows[0];
  emp.salary = Number(emp.salary);
  return res.json(emp);
};

exports.deleteEmployee = async (req, res) => {
  const companyId = req.user.company_id;
  const id = toInt(req.params.id, 0);

  const result = await db.query(
    `UPDATE employees
     SET is_active = false
     WHERE id = $1 AND company_id = $2
     RETURNING id`,
    [id, companyId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "employee not found" });
  }

  return res.status(204).send();
};

exports.restoreEmployee = async (req, res) => {
  const companyId = req.user.company_id;
  const id = toInt(req.params.id, 0);

  const result = await db.query(
    `UPDATE employees
     SET is_active = true
     WHERE id = $1 AND company_id = $2
     RETURNING id, first_name, last_name, email, department, position,
               ROUND(salary, 2) AS salary, is_active, created_at, company_id`,
    [id, companyId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: "employee not found" });
  }

  const emp = result.rows[0];
  emp.salary = Number(emp.salary);
  return res.json(emp);
};

exports.updateEmployeeSalary = async (req, res) => {
  const companyId = req.user.company_id;
  const id = toInt(req.params.id, 0);
  const { salary } = req.body;

  if (salary === undefined || salary === null || Number.isNaN(Number(salary))) {
    return res.status(400).json({ error: "salary must be a number" });
  }

  // Ensure employee is in SAME COMPANY, get old salary first
  const empRes = await db.query(
    `SELECT id, salary
     FROM employees
     WHERE id = $1 AND company_id = $2`,
    [id, companyId]
  );

  if (!empRes.rows.length) {
    return res.status(404).json({ error: "employee not found" });
  }

  const oldSalary = empRes.rows[0].salary;

  await db.query("BEGIN");

  try {
    const updateRes = await db.query(
      `UPDATE employees
       SET salary = $1
       WHERE id = $2 AND company_id = $3
       RETURNING id, first_name, last_name, email, department, position,
                 ROUND(salary, 2) AS salary, is_active, created_at, company_id`,
      [salary, id, companyId]
    );

    // audit log (company scoped)
    await db.query(
      `INSERT INTO employee_salary_audit
        (employee_id, old_salary, new_salary, changed_by_user_id, company_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, oldSalary, salary, req.user.id, companyId]
    );

    await db.query("COMMIT");

    const emp = updateRes.rows[0];
    emp.salary = Number(emp.salary);
    return res.json(emp);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};
