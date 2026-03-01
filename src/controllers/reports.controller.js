const db = require("../db");
const ExcelJS = require("exceljs");
const { Parser } = require("json2csv");

function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function formatMoney(val) {
  return Number(val || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toNum(val) {
  return Number(val || 0);
}

// =====================================================
// EXISTING QUERIES
// =====================================================
async function getSummaryData(companyId) {
  const result = await db.query(
    `SELECT
      COUNT(*)::int AS total_employees,
      COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
      COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
    FROM employees
    WHERE company_id = $1 AND is_active = true`,
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
    `SELECT
      department,
      COUNT(*)::int AS total_employees,
      COALESCE(ROUND(SUM(salary), 2), 0) AS total_salary,
      COALESCE(ROUND(AVG(salary), 2), 0) AS avg_salary
    FROM employees
    WHERE company_id = $1 AND is_active = true
    GROUP BY department
    ORDER BY total_salary DESC, department ASC`,
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
    `SELECT
      id, first_name, last_name, email, department, position,
      COALESCE(ROUND(salary, 2), 0) AS salary,
      created_at, company_id
    FROM employees
    WHERE company_id = $1 AND is_active = true
    ORDER BY salary DESC, id DESC
    LIMIT 10`,
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

// =====================================================
// EXISTING JSON ENDPOINTS
// =====================================================
exports.getSummary = async (req, res) => {
  try {
    const data = await getSummaryData(req.user.company_id);
    return res.json({ version: "reports-export-v1", ...data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports summary failed" });
  }
};

exports.getSalaryByDepartment = async (req, res) => {
  try {
    const rows = await getByDepartmentData(req.user.company_id);
    return res.json({ data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports by-department failed" });
  }
};

exports.getHighestPaid = async (req, res) => {
  try {
    const rows = await getHighestPaidData(req.user.company_id);
    return res.json({ data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "reports highest-paid failed" });
  }
};

// =====================================================
// EXISTING EXPORT ENDPOINTS
// =====================================================
exports.exportSummaryCsv = async (req, res) => {
  try {
    const row = await getSummaryData(req.user.company_id);
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
    const row = await getSummaryData(req.user.company_id);
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

exports.exportByDepartmentCsv = async (req, res) => {
  try {
    const rows = await getByDepartmentData(req.user.company_id);
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
    const rows = await getByDepartmentData(req.user.company_id);
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

exports.exportHighestPaidCsv = async (req, res) => {
  try {
    const rows = await getHighestPaidData(req.user.company_id);
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
    const rows = await getHighestPaidData(req.user.company_id);
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
    ws.addRows(rows.map((r) => ({ ...r, salary: round2(r.salary) })));
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

// =====================================================
// NEW: FULL HR REPORT HELPER
// =====================================================
async function getReportData(companyId, year, month) {
  const [employees, payroll, leave, attendance, emp201, ui19, irp5] =
    await Promise.all([
      db.query(
        `SELECT e.* FROM employees e WHERE e.company_id = $1 ORDER BY e.first_name`,
        [companyId]
      ),
      db.query(
        `SELECT pr.*, e.first_name || ' ' || e.last_name AS employee_name, e.department
              FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
              WHERE pr.company_id = $1 AND pr.year = $2 ${
                month ? "AND pr.month = $3" : ""
              }
              ORDER BY pr.year, pr.month, e.first_name`,
        month ? [companyId, year, month] : [companyId, year]
      ),
      db.query(
        `SELECT lr.*, e.first_name || ' ' || e.last_name AS employee_name
              FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
              WHERE lr.company_id = $1 AND EXTRACT(YEAR FROM lr.start_date) = $2
              ORDER BY lr.start_date`,
        [companyId, year]
      ),
      db.query(
        `SELECT ar.*, e.first_name || ' ' || e.last_name AS employee_name
              FROM attendance_records ar JOIN employees e ON e.id = ar.employee_id
              WHERE ar.company_id = $1 AND EXTRACT(YEAR FROM ar.date) = $2
              ${month ? "AND EXTRACT(MONTH FROM ar.date) = $3" : ""}
              ORDER BY ar.date`,
        month ? [companyId, year, month] : [companyId, year]
      ),
      db.query(
        `SELECT * FROM emp201_declarations WHERE company_id = $1 AND tax_year = $2 ORDER BY tax_period`,
        [companyId, year.toString()]
      ),
      db.query(
        `SELECT * FROM ui19_declarations WHERE company_id = $1 AND year = $2 ORDER BY month`,
        [companyId, year]
      ),
      db.query(
        `SELECT * FROM irp5_certificates WHERE company_id = $1 AND tax_year = $2 ORDER BY employee_name`,
        [companyId, year.toString()]
      ),
    ]);

  return {
    employees: employees.rows,
    payroll: payroll.rows,
    leave: leave.rows,
    attendance: attendance.rows,
    emp201: emp201.rows,
    ui19: ui19.rows,
    irp5: irp5.rows,
  };
}

// =====================================================
// NEW: PREVIEW
// =====================================================
exports.getPreview = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : null;
    const data = await getReportData(companyId, year, month);
    return res.json({
      employee_count: data.employees.length,
      active_employees: data.employees.filter((e) => e.is_active).length,
      payroll_records: data.payroll.length,
      total_gross: data.payroll.reduce((s, r) => s + toNum(r.gross_pay), 0),
      total_net: data.payroll.reduce((s, r) => s + toNum(r.net_pay), 0),
      total_paye: data.payroll.reduce((s, r) => s + toNum(r.tax), 0),
      total_uif: data.payroll.reduce((s, r) => s + toNum(r.uif), 0),
      leave_requests: data.leave.length,
      approved_leave: data.leave.filter((l) => l.status === "approved").length,
      attendance_records: data.attendance.length,
      emp201_count: data.emp201.length,
      ui19_count: data.ui19.length,
      irp5_count: data.irp5.length,
    });
  } catch (err) {
    console.error("ERROR in getPreview:", err);
    return res
      .status(500)
      .json({ error: "Failed to get preview", details: err.message });
  }
};

// =====================================================
// NEW: EXPORT EXCEL — Full HR Report
// =====================================================
exports.exportExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : null;
    const data = await getReportData(companyId, year, month);

    const company = await db.query(`SELECT name FROM companies WHERE id = $1`, [
      companyId,
    ]);
    const companyName = company.rows[0]?.name || "Company";

    const wb = new ExcelJS.Workbook();
    wb.creator = "PeopleOS";
    wb.created = new Date();

    const subHeaderStyle = {
      font: {
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 10,
        name: "Arial",
      },
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF334155" },
      },
      alignment: { horizontal: "center", vertical: "middle" },
    };
    const titleStyle = {
      font: {
        bold: true,
        size: 14,
        name: "Arial",
        color: { argb: "FF0F172A" },
      },
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFCD34D" },
      },
      alignment: { horizontal: "left", vertical: "middle" },
    };
    const totalStyle = {
      font: { bold: true, size: 11, name: "Arial" },
      fill: {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      },
      border: { top: { style: "medium" } },
    };
    const altRowFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF8FAFC" },
    };
    const moneyFmt = "R #,##0.00";
    const months = [
      "",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    function addTitleRow(sheet, title, cols) {
      const row = sheet.addRow([title]);
      sheet.mergeCells(row.number, 1, row.number, cols);
      Object.assign(row.getCell(1), titleStyle);
      row.height = 28;
      sheet.addRow([
        `Generated: ${new Date().toLocaleDateString("en-ZA")} | Year: ${year}${
          month ? " | Month: " + month : ""
        } | Company: ${companyName}`,
      ]);
      sheet.addRow([]);
    }

    function styleHeaderRow(row) {
      row.eachCell((cell) => Object.assign(cell, subHeaderStyle));
      row.height = 20;
    }

    // SHEET 1: Summary
    const summarySheet = wb.addWorksheet("Summary", {
      tabColor: { argb: "FFFCD34D" },
    });
    summarySheet.columns = [
      { width: 35 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
    ];
    addTitleRow(summarySheet, "📊 HR SUMMARY REPORT", 4);
    const kpiHeaders = summarySheet.addRow(["Metric", "Value", "Details", ""]);
    styleHeaderRow(kpiHeaders);
    const totalGross = data.payroll.reduce((s, r) => s + toNum(r.gross_pay), 0);
    const totalNet = data.payroll.reduce((s, r) => s + toNum(r.net_pay), 0);
    const totalPaye = data.payroll.reduce((s, r) => s + toNum(r.tax), 0);
    const totalUif = data.payroll.reduce((s, r) => s + toNum(r.uif), 0);
    const kpiRows = [
      [
        "Total Employees",
        data.employees.length,
        `${data.employees.filter((e) => e.is_active).length} active`,
        "",
      ],
      ["Total Gross Payroll", totalGross, "Year to date", ""],
      ["Total Net Pay", totalNet, "Year to date", ""],
      ["Total PAYE", totalPaye, "Withheld for SARS", ""],
      ["Total UIF", totalUif, "Employee contributions", ""],
      [
        "Leave Requests",
        data.leave.length,
        `${data.leave.filter((l) => l.status === "approved").length} approved`,
        "",
      ],
      ["EMP201 Declarations", data.emp201.length, "This year", ""],
      ["IRP5 Certificates", data.irp5.length, `Tax year ${year}`, ""],
    ];
    kpiRows.forEach((rowData, i) => {
      const row = summarySheet.addRow(rowData);
      if (i % 2 === 0) row.getCell(1).fill = altRowFill;
      if ([1, 2, 3, 4].includes(i)) {
        row.getCell(2).numFmt = moneyFmt;
        row.getCell(2).value = rowData[1];
      }
      row.height = 18;
    });

    // SHEET 2: Employees
    const empSheet = wb.addWorksheet("Employees", {
      tabColor: { argb: "FF8B5CF6" },
    });
    empSheet.columns = [
      { key: "id", width: 8 },
      { key: "name", width: 28 },
      { key: "email", width: 30 },
      { key: "dept", width: 20 },
      { key: "position", width: 22 },
      { key: "salary", width: 18 },
      { key: "type", width: 16 },
      { key: "status", width: 12 },
      { key: "id_number", width: 20 },
      { key: "tax_number", width: 18 },
    ];
    addTitleRow(empSheet, "👥 EMPLOYEE REGISTER", 10);
    const empHeader = empSheet.addRow([
      "ID",
      "Full Name",
      "Email",
      "Department",
      "Position",
      "Salary",
      "Type",
      "Status",
      "ID Number",
      "Tax Number",
    ]);
    styleHeaderRow(empHeader);
    data.employees.forEach((e, i) => {
      const row = empSheet.addRow({
        id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        email: e.email,
        dept: e.department || "—",
        position: e.position || "—",
        salary: toNum(e.salary),
        type: e.employment_type || "—",
        status: e.is_active ? "Active" : "Inactive",
        id_number: e.id_number || "—",
        tax_number: e.tax_number || "—",
      });
      row.getCell("salary").numFmt = moneyFmt;
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      row.height = 17;
    });
    const empTotal = empSheet.addRow([
      "",
      `TOTAL: ${data.employees.length} employees`,
      "",
      "",
      "",
      `=SUM(F5:F${4 + data.employees.length})`,
      "",
      "",
      "",
      "",
    ]);
    empTotal.eachCell((c) => Object.assign(c, totalStyle));
    empTotal.getCell(6).numFmt = moneyFmt;

    // SHEET 3: Payroll
    const paySheet = wb.addWorksheet("Payroll", {
      tabColor: { argb: "FFF59E0B" },
    });
    paySheet.columns = [
      { key: "period", width: 14 },
      { key: "name", width: 28 },
      { key: "dept", width: 18 },
      { key: "gross", width: 18 },
      { key: "tax", width: 16 },
      { key: "uif", width: 14 },
      { key: "net", width: 18 },
      { key: "status", width: 14 },
    ];
    addTitleRow(paySheet, "💰 PAYROLL REPORT", 8);
    const payHeader = paySheet.addRow([
      "Period",
      "Employee",
      "Department",
      "Gross Pay",
      "PAYE",
      "UIF",
      "Net Pay",
      "Status",
    ]);
    styleHeaderRow(payHeader);
    data.payroll.forEach((p, i) => {
      const row = paySheet.addRow({
        period: `${months[p.month]} ${p.year}`,
        name: p.employee_name,
        dept: p.department || "—",
        gross: toNum(p.gross_pay),
        tax: toNum(p.tax),
        uif: toNum(p.uif),
        net: toNum(p.net_pay),
        status: p.status,
      });
      ["gross", "tax", "uif", "net"].forEach(
        (k) => (row.getCell(k).numFmt = moneyFmt)
      );
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      row.height = 17;
    });
    const ps = 5,
      pe = 4 + data.payroll.length;
    const payTotal = paySheet.addRow([
      "TOTALS",
      `${data.payroll.length} records`,
      "",
      `=SUM(D${ps}:D${pe})`,
      `=SUM(E${ps}:E${pe})`,
      `=SUM(F${ps}:F${pe})`,
      `=SUM(G${ps}:G${pe})`,
      "",
    ]);
    payTotal.eachCell((c) => Object.assign(c, totalStyle));
    ["D", "E", "F", "G"].forEach(
      (col) => (payTotal.getCell(col).numFmt = moneyFmt)
    );

    // SHEET 4: Leave
    const leaveSheet = wb.addWorksheet("Leave", {
      tabColor: { argb: "FF10B981" },
    });
    leaveSheet.columns = [
      { key: "name", width: 28 },
      { key: "type", width: 18 },
      { key: "start", width: 16 },
      { key: "end", width: 16 },
      { key: "days", width: 10 },
      { key: "status", width: 14 },
      { key: "reason", width: 35 },
    ];
    addTitleRow(leaveSheet, "🏖️ LEAVE REPORT", 7);
    const leaveHeader = leaveSheet.addRow([
      "Employee",
      "Leave Type",
      "Start Date",
      "End Date",
      "Days",
      "Status",
      "Reason",
    ]);
    styleHeaderRow(leaveHeader);
    data.leave.forEach((l, i) => {
      const row = leaveSheet.addRow({
        name: l.employee_name,
        type: l.leave_type,
        start: new Date(l.start_date).toLocaleDateString("en-ZA"),
        end: new Date(l.end_date).toLocaleDateString("en-ZA"),
        days: l.days_requested || l.total_days || 0,
        status: l.status,
        reason: l.reason || "—",
      });
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      const sc = row.getCell("status");
      if (l.status === "approved")
        sc.font = { color: { argb: "FF10B981" }, bold: true, name: "Arial" };
      if (l.status === "rejected")
        sc.font = { color: { argb: "FFEF4444" }, bold: true, name: "Arial" };
      if (l.status === "pending")
        sc.font = { color: { argb: "FFF59E0B" }, bold: true, name: "Arial" };
      row.height = 17;
    });
    leaveSheet
      .addRow([
        `TOTAL: ${data.leave.length} requests`,
        "",
        "",
        "",
        `=SUM(E5:E${4 + data.leave.length})`,
        "",
        "",
      ])
      .eachCell((c) => Object.assign(c, totalStyle));

    // SHEET 5: Attendance
    const attSheet = wb.addWorksheet("Attendance", {
      tabColor: { argb: "FF3B82F6" },
    });
    attSheet.columns = [
      { key: "name", width: 28 },
      { key: "date", width: 16 },
      { key: "clock_in", width: 14 },
      { key: "clock_out", width: 14 },
      { key: "hours", width: 12 },
      { key: "overtime", width: 12 },
      { key: "status", width: 14 },
    ];
    addTitleRow(attSheet, "🕐 ATTENDANCE REPORT", 7);
    const attHeader = attSheet.addRow([
      "Employee",
      "Date",
      "Clock In",
      "Clock Out",
      "Hours Worked",
      "Overtime",
      "Status",
    ]);
    styleHeaderRow(attHeader);
    data.attendance.forEach((a, i) => {
      const row = attSheet.addRow({
        name: a.employee_name,
        date: new Date(a.date).toLocaleDateString("en-ZA"),
        clock_in: a.clock_in
          ? new Date(a.clock_in).toLocaleTimeString("en-ZA", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        clock_out: a.clock_out
          ? new Date(a.clock_out).toLocaleTimeString("en-ZA", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        hours: toNum(a.total_hours).toFixed(2),
        overtime: toNum(a.overtime_hours).toFixed(2),
        status: a.status || "—",
      });
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      row.height = 17;
    });
    const as = 5,
      ae = 4 + data.attendance.length;
    attSheet
      .addRow([
        `TOTAL: ${data.attendance.length} records`,
        "",
        "",
        "",
        `=SUM(E${as}:E${ae})`,
        `=SUM(F${as}:F${ae})`,
        "",
      ])
      .eachCell((c) => Object.assign(c, totalStyle));

    // SHEET 6: SARS Compliance
    const sarsSheet = wb.addWorksheet("SARS Compliance", {
      tabColor: { argb: "FFEF4444" },
    });
    sarsSheet.columns = [
      { key: "type", width: 18 },
      { key: "period", width: 16 },
      { key: "employees", width: 14 },
      { key: "paye", width: 18 },
      { key: "sdl", width: 16 },
      { key: "uif", width: 16 },
      { key: "total", width: 18 },
      { key: "sub_status", width: 16 },
      { key: "pay_status", width: 16 },
    ];
    addTitleRow(sarsSheet, "🏛️ SARS COMPLIANCE REPORT", 9);
    sarsSheet.addRow(["EMP201 DECLARATIONS"]).getCell(1).font = {
      bold: true,
      size: 12,
      name: "Arial",
    };
    styleHeaderRow(
      sarsSheet.addRow([
        "Type",
        "Period",
        "Employees",
        "PAYE",
        "SDL",
        "UIF",
        "Total Liability",
        "Submission",
        "Payment",
      ])
    );
    data.emp201.forEach((e, i) => {
      const row = sarsSheet.addRow({
        type: "EMP201",
        period: `${months[parseInt(e.tax_period)]} ${e.tax_year}`,
        employees: e.employee_count,
        paye: toNum(e.paye_amount),
        sdl: toNum(e.sdl_amount),
        uif: toNum(e.uif_total_amount),
        total: toNum(e.total_liability),
        sub_status: e.submission_status,
        pay_status: e.payment_status,
      });
      ["paye", "sdl", "uif", "total"].forEach(
        (k) => (row.getCell(k).numFmt = moneyFmt)
      );
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      row.height = 17;
    });
    sarsSheet.addRow([]);
    sarsSheet.addRow(["UI-19 DECLARATIONS"]).getCell(1).font = {
      bold: true,
      size: 12,
      name: "Arial",
    };
    styleHeaderRow(
      sarsSheet.addRow([
        "Type",
        "Period",
        "Employees",
        "UIF Employee",
        "UIF Employer",
        "Total UIF",
        "Status",
        "",
        "",
      ])
    );
    data.ui19.forEach((u, i) => {
      const row = sarsSheet.addRow({
        type: "UI-19",
        period: `${months[u.month]} ${u.year}`,
        employees: u.employee_count,
        paye: toNum(u.total_uif_employee),
        sdl: toNum(u.total_uif_employer),
        uif: toNum(u.total_uif),
        total: "",
        sub_status: u.submission_status,
        pay_status: "",
      });
      ["paye", "sdl", "uif"].forEach((k) => (row.getCell(k).numFmt = moneyFmt));
      if (i % 2 === 0)
        row.eachCell((c) => {
          c.fill = altRowFill;
        });
      row.height = 17;
    });

    // SHEET 7: IRP5
    if (data.irp5.length > 0) {
      const irp5Sheet = wb.addWorksheet("IRP5 Certificates", {
        tabColor: { argb: "FFF59E0B" },
      });
      irp5Sheet.columns = [
        { key: "cert", width: 26 },
        { key: "name", width: 26 },
        { key: "id_num", width: 18 },
        { key: "tax_num", width: 16 },
        { key: "gross", width: 18 },
        { key: "paye", width: 16 },
        { key: "uif", width: 14 },
        { key: "sdl", width: 14 },
        { key: "net", width: 18 },
        { key: "months", width: 10 },
        { key: "status", width: 12 },
      ];
      addTitleRow(irp5Sheet, "📜 IRP5 TAX CERTIFICATES", 11);
      styleHeaderRow(
        irp5Sheet.addRow([
          "Certificate No",
          "Employee",
          "ID Number",
          "Tax Number",
          "Gross (3601)",
          "PAYE (4101)",
          "UIF (4141)",
          "SDL (4149)",
          "Net Pay",
          "Months",
          "Status",
        ])
      );
      data.irp5.forEach((c, i) => {
        const row = irp5Sheet.addRow({
          cert: c.certificate_number,
          name: c.employee_name,
          id_num: c.employee_id_number || "—",
          tax_num: c.employee_tax_number || "—",
          gross: toNum(c.code_3601),
          paye: toNum(c.code_4101),
          uif: toNum(c.code_4141),
          sdl: toNum(c.code_4149),
          net: toNum(c.net_pay),
          months: c.months_employed,
          status: c.generation_status,
        });
        ["gross", "paye", "uif", "sdl", "net"].forEach(
          (k) => (row.getCell(k).numFmt = moneyFmt)
        );
        if (i % 2 === 0)
          row.eachCell((c) => {
            c.fill = altRowFill;
          });
        row.height = 17;
      });
      const is = 5,
        ie = 4 + data.irp5.length;
      const irp5Total = irp5Sheet.addRow([
        `TOTALS: ${data.irp5.length}`,
        "",
        "",
        "",
        `=SUM(E${is}:E${ie})`,
        `=SUM(F${is}:F${ie})`,
        `=SUM(G${is}:G${ie})`,
        `=SUM(H${is}:H${ie})`,
        `=SUM(I${is}:I${ie})`,
        "",
        "",
      ]);
      irp5Total.eachCell((c) => Object.assign(c, totalStyle));
      ["E", "F", "G", "H", "I"].forEach(
        (col) => (irp5Total.getCell(col).numFmt = moneyFmt)
      );
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="HR-Report-${year}${month ? "-" + month : ""}.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("ERROR in exportExcel:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate Excel report", details: err.message });
  }
};

// =====================================================
// NEW: EXPORT PDF — Full HR Report
// =====================================================
exports.exportPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = req.query.month ? parseInt(req.query.month) : null;
    const data = await getReportData(companyId, year, month);
    const company = await db.query(`SELECT name FROM companies WHERE id = $1`, [
      companyId,
    ]);
    const companyName = company.rows[0]?.name || "Company";

    const monthNames = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const shortMonths = [
      "",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const periodLabel = month
      ? `${monthNames[month]} ${year}`
      : `Full Year ${year}`;
    const totalGross = data.payroll.reduce((s, r) => s + toNum(r.gross_pay), 0);
    const totalNet = data.payroll.reduce((s, r) => s + toNum(r.net_pay), 0);
    const totalPaye = data.payroll.reduce((s, r) => s + toNum(r.tax), 0);
    const totalUif = data.payroll.reduce((s, r) => s + toNum(r.uif), 0);
    const activeEmployees = data.employees.filter((e) => e.is_active).length;
    const approvedLeave = data.leave.filter(
      (l) => l.status === "approved"
    ).length;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>HR Report - ${companyName} - ${periodLabel}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; background: white; }
    .page { padding: 30px; max-width: 1200px; margin: 0 auto; }
    .report-header { background: #1e293b; color: white; padding: 24px 30px; margin-bottom: 24px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .report-header h1 { font-size: 24px; font-weight: 900; letter-spacing: 1px; }
    .report-header p { font-size: 12px; color: #94a3b8; margin-top: 4px; }
    .report-badge { background: #f59e0b; color: #1e293b; padding: 6px 16px; border-radius: 6px; font-weight: 800; font-size: 13px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .kpi-value { font-size: 20px; font-weight: 800; color: #1e293b; }
    .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .section { margin-bottom: 28px; page-break-inside: avoid; }
    .section-title { background: #f59e0b; color: #1e293b; padding: 8px 14px; font-size: 13px; font-weight: 800; border-radius: 6px 6px 0 0; letter-spacing: 0.5px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .money { text-align: right; font-family: 'Courier New', monospace; }
    .total-row td { background: #e2e8f0 !important; font-weight: 800; border-top: 2px solid #94a3b8; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .badge-approved, .badge-paid, .badge-submitted { background: #d1fae5; color: #059669; }
    .badge-pending, .badge-draft { background: #fef3c7; color: #d97706; }
    .badge-rejected { background: #fee2e2; color: #dc2626; }
    .badge-processed { background: #dbeafe; color: #2563eb; }
    .report-footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
    @media print { .page { padding: 15px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
<div class="page">
  <div class="report-header">
    <div>
      <h1>📊 HR REPORT</h1>
      <p>${companyName} · ${periodLabel} · Generated ${new Date().toLocaleDateString(
      "en-ZA"
    )}</p>
    </div>
    <div class="report-badge">PeopleOS</div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card"><div class="kpi-value">${
      data.employees.length
    }</div><div class="kpi-label">Total Employees</div><div class="kpi-sub">${activeEmployees} active</div></div>
    <div class="kpi-card"><div class="kpi-value">R ${formatMoney(
      totalGross
    )}</div><div class="kpi-label">Gross Payroll</div><div class="kpi-sub">${
      data.payroll.length
    } records</div></div>
    <div class="kpi-card"><div class="kpi-value">R ${formatMoney(
      totalPaye
    )}</div><div class="kpi-label">PAYE Withheld</div><div class="kpi-sub">For SARS</div></div>
    <div class="kpi-card"><div class="kpi-value">${
      data.leave.length
    }</div><div class="kpi-label">Leave Requests</div><div class="kpi-sub">${approvedLeave} approved</div></div>
    <div class="kpi-card"><div class="kpi-value">R ${formatMoney(
      totalNet
    )}</div><div class="kpi-label">Net Pay</div><div class="kpi-sub">Take-home total</div></div>
    <div class="kpi-card"><div class="kpi-value">R ${formatMoney(
      totalUif
    )}</div><div class="kpi-label">UIF Employee</div><div class="kpi-sub">Contributions</div></div>
    <div class="kpi-card"><div class="kpi-value">${
      data.emp201.length
    }</div><div class="kpi-label">EMP201 Filed</div><div class="kpi-sub">SARS declarations</div></div>
    <div class="kpi-card"><div class="kpi-value">${
      data.irp5.length
    }</div><div class="kpi-label">IRP5 Certs</div><div class="kpi-sub">Tax year ${year}</div></div>
  </div>

  <div class="section">
    <div class="section-title">👥 EMPLOYEE REGISTER (${
      data.employees.length
    } employees)</div>
    <table>
      <thead><tr><th>#</th><th>Full Name</th><th>Department</th><th>Position</th><th>Salary</th><th>Type</th><th>Status</th></tr></thead>
      <tbody>
        ${data.employees
          .map(
            (e, i) =>
              `<tr><td>${i + 1}</td><td>${e.first_name} ${
                e.last_name
              }</td><td>${e.department || "—"}</td><td>${
                e.position || "—"
              }</td><td class="money">R ${formatMoney(e.salary)}</td><td>${
                e.employment_type || "—"
              }</td><td><span class="badge badge-${
                e.is_active ? "approved" : "rejected"
              }">${e.is_active ? "Active" : "Inactive"}</span></td></tr>`
          )
          .join("")}
        <tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td class="money"><strong>R ${formatMoney(
          data.employees.reduce((s, e) => s + toNum(e.salary), 0)
        )}</strong></td><td colspan="2"></td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">💰 PAYROLL SUMMARY (${
      data.payroll.length
    } records)</div>
    <table>
      <thead><tr><th>Period</th><th>Employee</th><th>Department</th><th>Gross</th><th>PAYE</th><th>UIF</th><th>Net Pay</th><th>Status</th></tr></thead>
      <tbody>
        ${data.payroll
          .map(
            (p) =>
              `<tr><td>${shortMonths[p.month]} ${p.year}</td><td>${
                p.employee_name
              }</td><td>${
                p.department || "—"
              }</td><td class="money">R ${formatMoney(
                p.gross_pay
              )}</td><td class="money">R ${formatMoney(
                p.tax
              )}</td><td class="money">R ${formatMoney(
                p.uif
              )}</td><td class="money">R ${formatMoney(
                p.net_pay
              )}</td><td><span class="badge badge-${p.status}">${
                p.status
              }</span></td></tr>`
          )
          .join("")}
        <tr class="total-row"><td colspan="3"><strong>TOTALS</strong></td><td class="money"><strong>R ${formatMoney(
          totalGross
        )}</strong></td><td class="money"><strong>R ${formatMoney(
      totalPaye
    )}</strong></td><td class="money"><strong>R ${formatMoney(
      totalUif
    )}</strong></td><td class="money"><strong>R ${formatMoney(
      totalNet
    )}</strong></td><td></td></tr>
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">🏖️ LEAVE REPORT (${
      data.leave.length
    } requests)</div>
    <table>
      <thead><tr><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Days</th><th>Status</th></tr></thead>
      <tbody>
        ${
          data.leave.length === 0
            ? '<tr><td colspan="6" style="text-align:center;color:#94a3b8;">No leave records</td></tr>'
            : data.leave
                .map(
                  (l) =>
                    `<tr><td>${l.employee_name}</td><td>${
                      l.leave_type
                    }</td><td>${new Date(l.start_date).toLocaleDateString(
                      "en-ZA"
                    )}</td><td>${new Date(l.end_date).toLocaleDateString(
                      "en-ZA"
                    )}</td><td>${
                      l.days_requested || l.total_days || 0
                    }</td><td><span class="badge badge-${l.status}">${
                      l.status
                    }</span></td></tr>`
                )
                .join("")
        }
      </tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">🏛️ SARS COMPLIANCE — EMP201 (${
      data.emp201.length
    } declarations)</div>
    <table>
      <thead><tr><th>Period</th><th>Employees</th><th>PAYE</th><th>SDL</th><th>UIF</th><th>Total Liability</th><th>Submission</th><th>Payment</th></tr></thead>
      <tbody>
        ${
          data.emp201.length === 0
            ? '<tr><td colspan="8" style="text-align:center;color:#94a3b8;">No EMP201 declarations</td></tr>'
            : data.emp201
                .map(
                  (e) =>
                    `<tr><td>${shortMonths[parseInt(e.tax_period)]} ${
                      e.tax_year
                    }</td><td>${
                      e.employee_count
                    }</td><td class="money">R ${formatMoney(
                      e.paye_amount
                    )}</td><td class="money">R ${formatMoney(
                      e.sdl_amount
                    )}</td><td class="money">R ${formatMoney(
                      e.uif_total_amount
                    )}</td><td class="money">R ${formatMoney(
                      e.total_liability
                    )}</td><td><span class="badge badge-${
                      e.submission_status
                    }">${
                      e.submission_status
                    }</span></td><td><span class="badge badge-${
                      e.payment_status === "paid" ? "paid" : "draft"
                    }">${e.payment_status}</span></td></tr>`
                )
                .join("")
        }
        ${
          data.emp201.length > 0
            ? `<tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td><td class="money"><strong>R ${formatMoney(
                data.emp201.reduce((s, e) => s + toNum(e.paye_amount), 0)
              )}</strong></td><td class="money"><strong>R ${formatMoney(
                data.emp201.reduce((s, e) => s + toNum(e.sdl_amount), 0)
              )}</strong></td><td class="money"><strong>R ${formatMoney(
                data.emp201.reduce((s, e) => s + toNum(e.uif_total_amount), 0)
              )}</strong></td><td class="money"><strong>R ${formatMoney(
                data.emp201.reduce((s, e) => s + toNum(e.total_liability), 0)
              )}</strong></td><td colspan="2"></td></tr>`
            : ""
        }
      </tbody>
    </table>
  </div>

  ${
    data.irp5.length > 0
      ? `
  <div class="section">
    <div class="section-title">📜 IRP5 CERTIFICATES — Tax Year ${year} (${
          data.irp5.length
        } certificates)</div>
    <table>
      <thead><tr><th>Certificate</th><th>Employee</th><th>Gross (3601)</th><th>PAYE (4101)</th><th>UIF (4141)</th><th>SDL (4149)</th><th>Net Pay</th><th>Status</th></tr></thead>
      <tbody>
        ${data.irp5
          .map(
            (c) =>
              `<tr><td style="font-family:monospace;font-size:9px;">${
                c.certificate_number
              }</td><td>${
                c.employee_name
              }</td><td class="money">R ${formatMoney(
                c.code_3601
              )}</td><td class="money">R ${formatMoney(
                c.code_4101
              )}</td><td class="money">R ${formatMoney(
                c.code_4141
              )}</td><td class="money">R ${formatMoney(
                c.code_4149
              )}</td><td class="money">R ${formatMoney(
                c.net_pay
              )}</td><td><span class="badge badge-${
                c.generation_status === "issued" ? "paid" : "draft"
              }">${c.generation_status}</span></td></tr>`
          )
          .join("")}
        <tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td><td class="money"><strong>R ${formatMoney(
          data.irp5.reduce((s, c) => s + toNum(c.code_3601), 0)
        )}</strong></td><td class="money"><strong>R ${formatMoney(
          data.irp5.reduce((s, c) => s + toNum(c.code_4101), 0)
        )}</strong></td><td class="money"><strong>R ${formatMoney(
          data.irp5.reduce((s, c) => s + toNum(c.code_4141), 0)
        )}</strong></td><td class="money"><strong>R ${formatMoney(
          data.irp5.reduce((s, c) => s + toNum(c.code_4149), 0)
        )}</strong></td><td class="money"><strong>R ${formatMoney(
          data.irp5.reduce((s, c) => s + toNum(c.net_pay), 0)
        )}</strong></td><td></td></tr>
      </tbody>
    </table>
  </div>`
      : ""
  }

  <div class="report-footer">
    <span>PeopleOS HR System · ${companyName}</span>
    <span>Report Period: ${periodLabel}</span>
    <span>Generated: ${new Date().toLocaleString("en-ZA")}</span>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    return res.send(html);
  } catch (err) {
    console.error("ERROR in exportPDF:", err);
    return res
      .status(500)
      .json({ error: "Failed to generate PDF report", details: err.message });
  }
};
