const db = require("../db");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

// helpers
function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

// -------- core report queries (scoped to company_id) --------
async function getSummaryData(companyId) {
  const result = await db.query(
    `
    SELECT
      COUNT(*)::int AS total_employees,
      COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
      COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
    FROM employees
    WHERE company_id = $1 AND is_active = true
  `,
    [companyId]
  );

  const row = result.rows[0] || {
    total_employees: 0,
    total_salary: 0,
    avg_salary: 0,
  };

  return {
    totalEmployees: row.total_employees,
    totalSalary: Number(row.total_salary),
    averageSalary: Number(row.avg_salary),
  };
}

async function getByDepartmentData(companyId) {
  const result = await db.query(
    `
    SELECT
      department,
      COUNT(*)::int AS total_employees,
      COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
      COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
    FROM employees
    WHERE company_id = $1 AND is_active = true
    GROUP BY department
    ORDER BY total_salary DESC, department ASC
  `,
    [companyId]
  );

  return result.rows.map((r) => ({
    department: r.department,
    totalEmployees: r.total_employees,
    totalSalary: Number(r.total_salary),
    averageSalary: Number(r.avg_salary),
  }));
}

async function getHighestPaidData(companyId) {
  const result = await db.query(
    `
    SELECT
      id, first_name, last_name, email, department, position,
      COALESCE(ROUND(salary, 2), 0) AS salary,
      created_at, company_id
    FROM employees
    WHERE company_id = $1 AND is_active = true
    ORDER BY salary DESC, id DESC
    LIMIT 10
  `,
    [companyId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    department: r.department,
    position: r.position,
    salary: Number(r.salary),
    created_at: r.created_at,
    company_id: r.company_id,
  }));
}

// -------- JSON endpoints --------
exports.getSummary = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const data = await getSummaryData(companyId);

    return res.json({
      version: "reports-export-v1",
      ...data,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports summary failed" });
  }
};

exports.getSalaryByDepartment = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getByDepartmentData(companyId);
    return res.json({ data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports by-department failed" });
  }
};

exports.getHighestPaid = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getHighestPaidData(companyId);
    return res.json({ data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports highest-paid failed" });
  }
};

// -------- EXPORT: SUMMARY --------
exports.exportSummaryCsv = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const row = await getSummaryData(companyId);

    const parser = new Parser({
      fields: ["totalEmployees", "totalSalary", "averageSalary"],
    });
    const csv = parser.parse([row]);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_summary.csv"'
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export summary csv failed" });
  }
};

exports.exportSummaryXlsx = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const row = await getSummaryData(companyId);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Summary");

    ws.columns = [
      { header: "Total Employees", key: "totalEmployees", width: 18 },
      { header: "Total Salary", key: "totalSalary", width: 14 },
      { header: "Average Salary", key: "averageSalary", width: 14 },
    ];

    ws.addRow({
      totalEmployees: row.totalEmployees,
      totalSalary: round2(row.totalSalary),
      averageSalary: round2(row.averageSalary),
    });

    ws.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_summary.xlsx"'
    );

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export summary xlsx failed" });
  }
};

// -------- EXPORT: BY DEPARTMENT --------
exports.exportByDepartmentCsv = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getByDepartmentData(companyId);

    const parser = new Parser({
      fields: ["department", "totalEmployees", "totalSalary", "averageSalary"],
    });
    const csv = parser.parse(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_by_department.csv"'
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export by-department csv failed" });
  }
};

exports.exportByDepartmentXlsx = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getByDepartmentData(companyId);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("By Department");

    ws.columns = [
      { header: "Department", key: "department", width: 18 },
      { header: "Total Employees", key: "totalEmployees", width: 16 },
      { header: "Total Salary", key: "totalSalary", width: 14 },
      { header: "Average Salary", key: "averageSalary", width: 14 },
    ];

    ws.addRows(
      rows.map((r) => ({
        ...r,
        totalSalary: round2(r.totalSalary),
        averageSalary: round2(r.averageSalary),
      }))
    );

    ws.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_by_department.xlsx"'
    );

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export by-department xlsx failed" });
  }
};

// -------- EXPORT: HIGHEST PAID --------
exports.exportHighestPaidCsv = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getHighestPaidData(companyId);

    const parser = new Parser({
      fields: [
        "id",
        "first_name",
        "last_name",
        "email",
        "department",
        "position",
        "salary",
        "created_at",
        "company_id",
      ],
    });
    const csv = parser.parse(rows);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_highest_paid.csv"'
    );
    return res.status(200).send(csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export highest-paid csv failed" });
  }
};

exports.exportHighestPaidXlsx = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const rows = await getHighestPaidData(companyId);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Highest Paid");

    ws.columns = [
      { header: "ID", key: "id", width: 8 },
      { header: "First Name", key: "first_name", width: 16 },
      { header: "Last Name", key: "last_name", width: 16 },
      { header: "Email", key: "email", width: 26 },
      { header: "Department", key: "department", width: 16 },
      { header: "Position", key: "position", width: 16 },
      { header: "Salary", key: "salary", width: 12 },
      { header: "Created At", key: "created_at", width: 24 },
      { header: "Company ID", key: "company_id", width: 12 },
    ];

    ws.addRows(
      rows.map((r) => ({
        ...r,
        salary: round2(r.salary),
      }))
    );

    ws.getRow(1).font = { bold: true };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="report_highest_paid.xlsx"'
    );

    await wb.xlsx.write(res);
    return res.end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "export highest-paid xlsx failed" });
  }
};
