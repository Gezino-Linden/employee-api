const db = require("../db");

exports.getSummary = async (req, res) => {
  try {
    // total employees (active)
    const totalEmployees = await db.query(
      "SELECT COUNT(*)::int FROM employees WHERE active = true"
    );

    // total salary bill
    const totalSalary = await db.query(
      "SELECT COALESCE(SUM(salary),0)::numeric AS total FROM employees WHERE active = true"
    );

    // avg salary
    const avgSalary = await db.query(
      "SELECT COALESCE(AVG(salary),0)::numeric AS avg FROM employees WHERE active = true"
    );

    res.json({
      totalEmployees: totalEmployees.rows[0].count,
      totalSalary: totalSalary.rows[0].total,
      averageSalary: avgSalary.rows[0].avg,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "failed to load summary" });
  }
};

exports.getSalaryByDepartment = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT department,
             COUNT(*)::int as employees,
             SUM(salary)::numeric as total_salary,
             AVG(salary)::numeric as avg_salary
      FROM employees
      WHERE active = true
      GROUP BY department
      ORDER BY total_salary DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "failed department report" });
  }
};

exports.getHighestPaid = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, first_name, last_name, department, salary
      FROM employees
      WHERE active = true
      ORDER BY salary DESC
      LIMIT 5
    `);

    res.json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "failed highest paid report" });
  }
};
