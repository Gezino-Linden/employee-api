const db = require("../db");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// ---------- helpers ----------
function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolActive(activeParam) {
  // default true unless explicitly "false"
  if (activeParam === undefined) return true;
  return String(activeParam).toLowerCase() !== "false";
}

function cleanStr(v) {
  return (v || "").toString().trim();
}

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

async function fetchEmployeesForExport(req) {
  const companyId = req.user.company_id;

  const search = cleanStr(req.query.search);
  const department = cleanStr(req.query.department);
  const position = cleanStr(req.query.position);
  const active = toBoolActive(req.query.active);

  const where = [`company_id = $1`, `is_active = $2`];
  const params = [companyId, active];
  let i = params.length;

  if (search) {
    i++;
    where.push(
      `(first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR department ILIKE $${i} OR position ILIKE $${i})`
    );
    params.push(`%${search}%`);
  }

  if (department) {
    i++;
    where.push(`department = $${i}`);
    params.push(department);
  }

  if (position) {
    i++;
    where.push(`position = $${i}`);
    params.push(position);
  }

  const result = await db.query(
    `SELECT id, first_name, last_name, email, department, position,
            ROUND(salary, 2) AS salary, age,
            is_active, created_at, company_id
     FROM employees
     WHERE ${where.join(" AND ")}
     ORDER BY id DESC`,
    params
  );

  return result.rows;
}

// ---------- controllers ----------
exports.getEmployees = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const page = Math.max(toInt(req.query.page, 1), 1);
    const limit = clamp(toInt(req.query.limit, 10), 1, 50);
    const offset = (page - 1) * limit;

    const search = cleanStr(req.query.search);
    const department = cleanStr(req.query.department);
    const position = cleanStr(req.query.position);
    const active = toBoolActive(req.query.active);

    const where = [`company_id = $1`, `is_active = $2`];
    const params = [companyId, active];
    let i = params.length;

    if (search) {
      i++;
      where.push(
        `(first_name ILIKE $${i} OR last_name ILIKE $${i} OR email ILIKE $${i} OR department ILIKE $${i} OR position ILIKE $${i})`
      );
      params.push(`%${search}%`);
    }

    if (department) {
      i++;
      where.push(`department = $${i}`);
      params.push(department);
    }

    if (position) {
      i++;
      where.push(`position = $${i}`);
      params.push(position);
    }

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM employees
       WHERE ${where.join(" AND ")}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const listRes = await db.query(
      `SELECT id, first_name, last_name, email, department, position,
              ROUND(salary, 2) AS salary, age,
              is_active, created_at, company_id
       FROM employees
       WHERE ${where.join(" AND ")}
       ORDER BY id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: listRes.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "get employees failed" });
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const result = await db.query(
      `SELECT id, first_name, last_name, email, department, position,
              ROUND(salary, 2) AS salary, age,
              is_active, created_at, company_id
       FROM employees
       WHERE id=$1 AND company_id=$2`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "employee not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "get employee failed" });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const first_name = cleanStr(req.body.first_name);
    const last_name = cleanStr(req.body.last_name);
    const email = cleanStr(req.body.email).toLowerCase();
    const department = cleanStr(req.body.department);
    const position = cleanStr(req.body.position);
    const salary = Number(req.body.salary ?? 0);
    const age = toInt(req.body.age, null);

    if (first_name.length < 2)
      return res
        .status(400)
        .json({ error: "first_name must be at least 2 characters" });
    if (last_name.length < 2)
      return res
        .status(400)
        .json({ error: "last_name must be at least 2 characters" });
    if (!email.includes("@"))
      return res.status(400).json({ error: "valid email required" });
    if (!department)
      return res.status(400).json({ error: "department required" });
    if (!position) return res.status(400).json({ error: "position required" });
    if (!Number.isFinite(salary) || salary < 0)
      return res
        .status(400)
        .json({ error: "salary must be a non-negative number" });

    const result = await db.query(
      `INSERT INTO employees (first_name, last_name, email, department, position, salary, age, is_active, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
       RETURNING id, first_name, last_name, email, department, position,
                 ROUND(salary, 2) AS salary, age,
                 is_active, created_at, company_id`,
      [
        first_name,
        last_name,
        email,
        department,
        position,
        salary,
        age,
        companyId,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already exists" });
    }
    return res.status(500).json({ error: "create employee failed" });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const first_name = cleanStr(req.body.first_name);
    const last_name = cleanStr(req.body.last_name);
    const email = cleanStr(req.body.email).toLowerCase();
    const department = cleanStr(req.body.department);
    const position = cleanStr(req.body.position);
    const salary =
      req.body.salary !== undefined ? Number(req.body.salary) : undefined;
    const age =
      req.body.age !== undefined ? toInt(req.body.age, null) : undefined;

    if (first_name && first_name.length < 2)
      return res
        .status(400)
        .json({ error: "first_name must be at least 2 characters" });
    if (last_name && last_name.length < 2)
      return res
        .status(400)
        .json({ error: "last_name must be at least 2 characters" });
    if (email && !email.includes("@"))
      return res.status(400).json({ error: "valid email required" });
    if (salary !== undefined && (!Number.isFinite(salary) || salary < 0))
      return res
        .status(400)
        .json({ error: "salary must be a non-negative number" });

    // simple update: require full payload for now (keeps it clean)
    const result = await db.query(
      `UPDATE employees
       SET first_name=$1, last_name=$2, email=$3, department=$4, position=$5,
           salary=COALESCE($6, salary), age=COALESCE($7, age)
       WHERE id=$8 AND company_id=$9
       RETURNING id, first_name, last_name, email, department, position,
                 ROUND(salary, 2) AS salary, age,
                 is_active, created_at, company_id`,
      [
        first_name,
        last_name,
        email,
        department,
        position,
        salary,
        age,
        id,
        companyId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "employee not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already exists" });
    }
    return res.status(500).json({ error: "update employee failed" });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const result = await db.query(
      `UPDATE employees
       SET is_active=false
       WHERE id=$1 AND company_id=$2
       RETURNING id`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "employee not found" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "delete employee failed" });
  }
};

exports.restoreEmployee = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const result = await db.query(
      `UPDATE employees
       SET is_active=true
       WHERE id=$1 AND company_id=$2
       RETURNING id, first_name, last_name, email, department, position,
                 ROUND(salary, 2) AS salary,
                 is_active, created_at, company_id`,
      [id, companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "employee not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "restore employee failed" });
  }
};

exports.updateEmployeeSalary = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const salary = Number(req.body.salary);
    if (!Number.isFinite(salary) || salary < 0) {
      return res
        .status(400)
        .json({ error: "salary must be a non-negative number" });
    }

    await db.query("BEGIN");

    // get current salary (scoped to company)
    const currentRes = await db.query(
      `SELECT id, salary
       FROM employees
       WHERE id=$1 AND company_id=$2`,
      [id, companyId]
    );

    if (currentRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(404).json({ error: "employee not found" });
    }

    const oldSalary = currentRes.rows[0].salary;

    // update salary
    const updateRes = await db.query(
      `UPDATE employees
       SET salary=$1
       WHERE id=$2 AND company_id=$3
       RETURNING id, first_name, last_name, email, department, position,
                 ROUND(salary, 2) AS salary,
                 is_active, created_at, company_id`,
      [salary, id, companyId]
    );

    // audit log
    await db.query(
      `INSERT INTO employee_salary_audit (employee_id, old_salary, new_salary, changed_by_user_id, changed_at, company_id)
       VALUES ($1,$2,$3,$4,now(),$5)`,
      [id, oldSalary, salary, req.user.id, companyId]
    );

    await db.query("COMMIT");
    return res.json(updateRes.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "update salary failed" });
  }
};

// ---------- EXPORTS ----------
exports.exportEmployeesCsv = async (req, res) => {
  try {
    const rows = await fetchEmployeesForExport(req);

    const fields = [
      "id",
      "first_name",
      "last_name",
      "email",
      "department",
      "position",
      "salary",
      "is_active",
      "created_at",
      "company_id",
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="employees.csv"'
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export csv failed" });
  }
};

exports.exportEmployeesXlsx = async (req, res) => {
  try {
    const rows = await fetchEmployeesForExport(req);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Employees");

    ws.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "First Name", key: "first_name", width: 18 },
      { header: "Last Name", key: "last_name", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Department", key: "department", width: 16 },
      { header: "Position", key: "position", width: 16 },
      { header: "Salary", key: "salary", width: 12 },
      { header: "Active", key: "is_active", width: 10 },
      { header: "Created At", key: "created_at", width: 24 },
      { header: "Company ID", key: "company_id", width: 12 },
    ];

    ws.addRows(rows);
    ws.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="employees.xlsx"'
    );

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export xlsx failed" });
  }
};
exports.getSalaryHistory = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const id = toInt(req.params.id, 0);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const result = await db.query(
      `SELECT id, employee_id, old_salary, new_salary, changed_at
       FROM employee_salary_audit
       WHERE employee_id = $1 AND company_id = $2
       ORDER BY changed_at DESC`,
      [id, companyId]
    );

    return res.json({ data: result.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "get salary history failed" });
  }
};
