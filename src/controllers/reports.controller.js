const db = require("../db");

// =========================
// 📊 SUMMARY REPORT
// =========================
exports.getSummary = async (req, res) => {
  try {
    const totalEmployeesRes = await db.query(
      "SELECT COUNT(*)::int AS total FROM employees WHERE is_active = true"
    );

    const totalSalaryRes = await db.query(
      `SELECT COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary
       FROM employees
       WHERE is_active = true`
    );

    const avgSalaryRes = await db.query(
      `SELECT COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
       FROM employees
       WHERE is_active = true`
    );

    return res.json({
      version: "0ccd411-rounding",
      totalEmployees: totalEmployeesRes.rows[0].total,
      totalSalary: Number(totalSalaryRes.rows[0].total_salary),
      averageSalary: Number(avgSalaryRes.rows[0].avg_salary),
    });

  } catch (err) {
    console.log("REPORT SUMMARY ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

// =========================
// 📊 SALARY BY DEPARTMENT
// =========================
exports.getSalaryByDepartment = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        department,
        COUNT(*)::int AS employees,
        COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
        COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
      FROM employees
      WHERE is_active = true
      GROUP BY department
      ORDER BY total_salary DESC
    `);

    // convert numeric strings → numbers
    const cleaned = result.rows.map((r) => ({
      department: r.department,
      employees: r.employees,
      total_salary: Number(r.total_salary),
      avg_salary: Number(r.avg_salary),
    }));

    return res.json(cleaned);
  } catch (err) {
    console.log("DEPARTMENT REPORT ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};

// =========================
// 💰 TOP 5 HIGHEST PAID
// =========================
exports.getHighestPaid = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id,
        first_name,
        last_name,
        department,
        position,
        ROUND(salary, 2) AS salary
      FROM employees
      WHERE is_active = true
      ORDER BY salary DESC
      LIMIT 5
    `);

    const cleaned = result.rows.map((r) => ({
      ...r,
      salary: Number(r.salary),
    }));

    return res.json(cleaned);
  } catch (err) {
    console.log("HIGHEST PAID ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
};
