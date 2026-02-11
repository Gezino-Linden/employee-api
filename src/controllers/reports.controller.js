const db = require("../db");

exports.getSummary = async (req, res) => {
  const companyId = req.user.company_id;

  try {
    const q = `
      SELECT
        COUNT(*)::int AS total_employees,
        COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
        COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
      FROM employees
      WHERE company_id = $1 AND is_active = true
    `;

    const r = await db.query(q, [companyId]);
    const row = r.rows[0];

    return res.json({
      totalEmployees: row.total_employees,
      totalSalary: Number(row.total_salary),
      averageSalary: Number(row.avg_salary),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

exports.getSalaryByDepartment = async (req, res) => {
  const companyId = req.user.company_id;

  try {
    const q = `
      SELECT
        department,
        COUNT(*)::int AS employees,
        COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
        COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
      FROM employees
      WHERE company_id = $1 AND is_active = true
      GROUP BY department
      ORDER BY total_salary DESC
    `;

    const r = await db.query(q, [companyId]);

    return res.json(
      r.rows.map((x) => ({
        department: x.department,
        employees: x.employees,
        totalSalary: Number(x.total_salary),
        averageSalary: Number(x.avg_salary),
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

exports.getHighestPaid = async (req, res) => {
  const companyId = req.user.company_id;

  try {
    const q = `
      SELECT
        id, first_name, last_name, email, department, position,
        ROUND(salary, 2) AS salary, created_at
      FROM employees
      WHERE company_id = $1 AND is_active = true
      ORDER BY salary DESC
      LIMIT 10
    `;

    const r = await db.query(q, [companyId]);

    return res.json(
      r.rows.map((e) => ({
        ...e,
        salary: Number(e.salary),
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};
