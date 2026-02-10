const db = require("../db");

// ================= SUMMARY REPORT =================
exports.getSummary = async (req, res) => {
  try {
    const totalEmployeesRes = await db.query(
      "SELECT COUNT(*)::int AS total FROM employees WHERE is_active = true"
    );

    const totalSalaryRes = await db.query(
      "SELECT COALESCE(SUM(salary),0)::numeric AS total_salary FROM employees WHERE is_active = true"
    );

    const avgSalaryRes = await db.query(
      "SELECT COALESCE(AVG(salary),0)::numeric AS avg_salary FROM employees WHERE is_active = true"
    );

    return res.json({
      totalEmployees: totalEmployeesRes.rows[0].total,
      totalSalary: totalSalaryRes.rows[0].total_salary,
      averageSalary: avgSalaryRes.rows[0].avg_salary,
    });
  } catch (err) {
    console.log("REPORT SUMMARY ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ================= SALARY BY DEPARTMENT =================
exports.getSalaryByDepartment = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        department,
        COUNT(*)::int AS employees,
        COALESCE(SUM(salary),0)::numeric AS total_salary,
        COALESCE(AVG(salary),0)::numeric AS avg_salary
      FROM employees
      WHERE is_active = true
      GROUP BY department
      ORDER BY total_salary DESC
    `);

    return res.json(result.rows);
  } catch (err) {
    console.log("DEPARTMENT REPORT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ================= HIGHEST PAID =================
exports.getHighestPaid = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, first_name, last_name, department, position, salary
      FROM employees
      WHERE is_active = true
      ORDER BY salary DESC
      LIMIT 5
    `);

    return res.json(result.rows);
  } catch (err) {
    console.log("HIGHEST PAID ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};
