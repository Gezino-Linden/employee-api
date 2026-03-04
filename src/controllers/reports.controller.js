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
// ADD THESE FUNCTIONS TO YOUR EXISTING reports.controller.js
// Place them after your existing report functions

// =====================================================
// DEPARTMENT LABOUR COSTING REPORT
// Includes payroll + shift costs
// =====================================================
exports.getDepartmentLabourCosting = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    // Get department costs from payroll
    const departmentCosts = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employee_count,
        COALESCE(SUM(pr.gross_pay), 0) as total_gross,
        COALESCE(SUM(pr.net_pay), 0) as total_net,
        COALESCE(SUM(pr.overtime), 0) as total_overtime,
        COALESCE(AVG(pr.gross_pay), 0) as avg_gross_per_employee
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 
         AND pr.month = $2 
         AND pr.year = $3
         AND pr.status IN ('processed', 'paid')
       GROUP BY e.department
       ORDER BY total_gross DESC`,
      [companyId, month, year]
    );
    
    // Get shift costs by department
    const shiftCosts = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(es.id) AS INTEGER) as shift_count,
        COALESCE(SUM(es.total_pay), 0) as total_shift_pay,
        COALESCE(SUM(es.shift_premium), 0) as total_shift_premium
       FROM employee_shifts es
       JOIN employees e ON es.employee_id = e.id
       WHERE es.company_id = $1
         AND EXTRACT(MONTH FROM es.shift_date) = $2
         AND EXTRACT(YEAR FROM es.shift_date) = $3
         AND es.status = 'completed'
       GROUP BY e.department`,
      [companyId, month, year]
    );
    
    // Get total for percentages
    const totals = await db.query(
      `SELECT COALESCE(SUM(pr.gross_pay), 0) as total_payroll
       FROM payroll_records pr
       WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
         AND pr.status IN ('processed', 'paid')`,
      [companyId, month, year]
    );
    
    const totalPayroll = parseFloat(totals.rows[0].total_payroll);
    
    // Merge data
    const departments = departmentCosts.rows.map(dept => {
      const shiftData = shiftCosts.rows.find(s => s.department === dept.department) || {};
      const totalCost = parseFloat(dept.total_gross) + parseFloat(shiftData.total_shift_pay || 0);
      const percentage = totalPayroll > 0 ? (totalCost / totalPayroll) * 100 : 0;
      
      return {
        department: dept.department || 'Unassigned',
        employee_count: dept.employee_count,
        payroll_cost: round2(dept.total_gross),
        shift_cost: round2(shiftData.total_shift_pay || 0),
        total_cost: round2(totalCost),
        percentage: round2(percentage),
        avg_cost: round2(dept.avg_gross_per_employee),
        overtime: round2(dept.total_overtime),
        shift_count: shiftData.shift_count || 0
      };
    });
    
    return res.json({
      period: { month, year },
      total_payroll: round2(totalPayroll),
      departments
    });
  } catch (err) {
    console.error('ERROR in getDepartmentLabourCosting:', err);
    return res.status(500).json({ error: 'Failed to generate department labour costing', details: err.message });
  }
};

// =====================================================
// SHIFT TYPE ANALYSIS
// Breakdown by shift type (Morning/Evening/Night)
// =====================================================
exports.getShiftTypeAnalysis = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT 
        st.name as shift_type,
        st.code,
        CAST(COUNT(es.id) AS INTEGER) as shift_count,
        CAST(COUNT(DISTINCT es.employee_id) AS INTEGER) as unique_employees,
        COALESCE(SUM(es.base_pay), 0) as total_base_pay,
        COALESCE(SUM(es.shift_premium), 0) as total_premium,
        COALESCE(SUM(es.total_pay), 0) as total_cost,
        COALESCE(AVG(es.total_pay), 0) as avg_cost_per_shift,
        st.start_time,
        st.end_time
       FROM employee_shifts es
       JOIN shift_templates st ON es.shift_template_id = st.id
       WHERE es.company_id = $1
         AND EXTRACT(MONTH FROM es.shift_date) = $2
         AND EXTRACT(YEAR FROM es.shift_date) = $3
         AND es.status = 'completed'
       GROUP BY st.name, st.code, st.start_time, st.end_time
       ORDER BY total_cost DESC`,
      [companyId, month, year]
    );
    
    return res.json({
      period: { month, year },
      shift_types: result.rows.map(row => ({
        shift_type: row.shift_type,
        code: row.code,
        shift_count: row.shift_count,
        unique_employees: row.unique_employees,
        total_base_pay: round2(row.total_base_pay),
        total_premium: round2(row.total_premium),
        total_cost: round2(row.total_cost),
        avg_cost_per_shift: round2(row.avg_cost_per_shift),
        start_time: row.start_time,
        end_time: row.end_time
      }))
    });
  } catch (err) {
    console.error('ERROR in getShiftTypeAnalysis:', err);
    return res.status(500).json({ error: 'Failed to generate shift analysis', details: err.message });
  }
};

// =====================================================
// LABOUR COST TRENDS
// Month-over-month comparison
// =====================================================
exports.getLabourCostTrends = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const department = req.query.department;
    
    let query = `
      SELECT 
        pr.month,
        e.department,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employee_count,
        COALESCE(SUM(pr.gross_pay), 0) as total_cost
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 AND pr.year = $2
         AND pr.status IN ('processed', 'paid')
    `;
    
    const params = [companyId, year];
    
    if (department) {
      query += ` AND e.department = $3`;
      params.push(department);
    }
    
    query += ` GROUP BY pr.month, e.department ORDER BY pr.month`;
    
    const result = await db.query(query, params);
    
    // Format for charts
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const trendData = months.map(month => {
      const monthData = result.rows.filter(r => r.month === month);
      const totalCost = monthData.reduce((sum, r) => sum + parseFloat(r.total_cost), 0);
      const totalEmployees = monthData.reduce((sum, r) => sum + r.employee_count, 0);
      
      return {
        month,
        total_cost: round2(totalCost),
        employee_count: totalEmployees,
        departments: monthData.map(d => ({
          department: d.department,
          cost: round2(d.total_cost),
          employees: d.employee_count
        }))
      };
    });
    
    return res.json({ year, department: department || 'All', trends: trendData });
  } catch (err) {
    console.error('ERROR in getLabourCostTrends:', err);
    return res.status(500).json({ error: 'Failed to generate trends', details: err.message });
  }
};

// =====================================================
// OVERTIME ANALYSIS
// Track overtime by department
// =====================================================
exports.getOvertimeAnalysis = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employees_with_overtime,
        COALESCE(SUM(pr.overtime), 0) as total_overtime_pay,
        COALESCE(SUM(pr.gross_pay), 0) as total_gross,
        CASE 
          WHEN SUM(pr.gross_pay) > 0 
          THEN (SUM(pr.overtime) / SUM(pr.gross_pay)) * 100
          ELSE 0
        END as overtime_percentage
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
         AND pr.status IN ('processed', 'paid')
         AND pr.overtime > 0
       GROUP BY e.department
       ORDER BY total_overtime_pay DESC`,
      [companyId, month, year]
    );
    
    return res.json({
      period: { month, year },
      departments: result.rows.map(row => ({
        department: row.department,
        employees_with_overtime: row.employees_with_overtime,
        total_overtime_pay: round2(row.total_overtime_pay),
        total_gross: round2(row.total_gross),
        overtime_percentage: round2(row.overtime_percentage)
      }))
    });
  } catch (err) {
    console.error('ERROR in getOvertimeAnalysis:', err);
    return res.status(500).json({ error: 'Failed to generate overtime analysis', details: err.message });
  }
};

// =====================================================
// EXPORT DEPARTMENT LABOUR COSTING CSV
// =====================================================
exports.exportDepartmentLabourCostingCSV = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT 
        e.department,
        CAST(COUNT(DISTINCT pr.employee_id) AS INTEGER) as employee_count,
        COALESCE(SUM(pr.basic_salary), 0) as basic_salary,
        COALESCE(SUM(pr.allowances), 0) as allowances,
        COALESCE(SUM(pr.overtime), 0) as overtime,
        COALESCE(SUM(pr.gross_pay), 0) as gross_pay,
        COALESCE(SUM(pr.total_deductions), 0) as deductions,
        COALESCE(SUM(pr.net_pay), 0) as net_pay
       FROM payroll_records pr
       JOIN employees e ON pr.employee_id = e.id
       WHERE pr.company_id = $1 AND pr.month = $2 AND pr.year = $3
         AND pr.status IN ('processed', 'paid')
       GROUP BY e.department
       ORDER BY gross_pay DESC`,
      [companyId, month, year]
    );
    
    let csv = 'Department Labour Costing Report\n';
    csv += `Period: ${month}/${year}\n\n`;
    csv += 'Department,Employees,Basic Salary,Allowances,Overtime,Gross Pay,Deductions,Net Pay\n';
    
    result.rows.forEach(row => {
      csv += `${row.department || 'Unassigned'},`;
      csv += `${row.employee_count},`;
      csv += `${round2(row.basic_salary)},`;
      csv += `${round2(row.allowances)},`;
      csv += `${round2(row.overtime)},`;
      csv += `${round2(row.gross_pay)},`;
      csv += `${round2(row.deductions)},`;
      csv += `${round2(row.net_pay)}\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="dept-labour-costing-${month}-${year}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('ERROR in exportDepartmentLabourCostingCSV:', err);
    return res.status(500).json({ error: 'Failed to export CSV', details: err.message });
  }
};
// =====================================================
// INDIVIDUAL REPORT ENDPOINTS
// Append these to the bottom of reports.controller.js
// (before the last line if any, or just add at the end)
// =====================================================

const moneyFmt = 'R #,##0.00';
const shortMonths = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fullMonths  = ['','January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Shared Excel styling helpers ──────────────────────
const HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } },
  alignment: { horizontal: 'center', vertical: 'middle' },
};
const TITLE_STYLE = {
  font: { bold: true, size: 13, name: 'Arial', color: { argb: 'FF0F172A' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCD34D' } },
  alignment: { horizontal: 'left', vertical: 'middle' },
};
const TOTAL_STYLE = {
  font: { bold: true, size: 10, name: 'Arial' },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } },
  border: { top: { style: 'medium' } },
};
const ALT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

function styleHeader(row) {
  row.eachCell(c => Object.assign(c, HEADER_STYLE));
  row.height = 20;
}
function addTitle(ws, title, cols, periodLabel, companyName) {
  const r = ws.addRow([title]);
  ws.mergeCells(r.number, 1, r.number, cols);
  Object.assign(r.getCell(1), TITLE_STYLE);
  r.height = 26;
  ws.addRow([`${companyName}  ·  ${periodLabel}  ·  Generated: ${new Date().toLocaleDateString('en-ZA')}`]);
  ws.addRow([]);
}
function altRow(row, i) {
  if (i % 2 === 0) row.eachCell(c => { c.fill = ALT_FILL; });
}

// ── HTML PDF template helper ──────────────────────────
function pdfWrapper(title, companyName, periodLabel, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${title} - ${companyName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:#fff}
.page{padding:28px;max-width:1100px;margin:0 auto}
.hdr{background:#1e293b;color:#fff;padding:20px 28px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.hdr h1{font-size:20px;font-weight:900;letter-spacing:.5px}
.hdr p{font-size:11px;color:#94a3b8;margin-top:3px}
.badge{background:#f59e0b;color:#1e293b;padding:5px 14px;border-radius:6px;font-weight:800;font-size:12px}
.sec{margin-bottom:24px}
.sec-title{background:#f59e0b;color:#1e293b;padding:7px 12px;font-size:12px;font-weight:800;border-radius:6px 6px 0 0}
table{width:100%;border-collapse:collapse}
th{background:#1e293b;color:#fff;padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
td{padding:6px 9px;border-bottom:1px solid #f1f5f9;font-size:10px}
tr:nth-child(even) td{background:#f8fafc}
.r{text-align:right;font-family:'Courier New',monospace}
.tot td{background:#e2e8f0!important;font-weight:800;border-top:2px solid #94a3b8}
.badge-ok{background:#d1fae5;color:#059669;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;text-transform:uppercase}
.badge-warn{background:#fef3c7;color:#d97706;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;text-transform:uppercase}
.badge-bad{background:#fee2e2;color:#dc2626;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;text-transform:uppercase}
.badge-info{background:#dbeafe;color:#2563eb;padding:1px 7px;border-radius:8px;font-size:9px;font-weight:700;text-transform:uppercase}
.ftr{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
@media print{.sec{page-break-inside:avoid}}
</style></head><body><div class="page">
<div class="hdr"><div><h1>${title}</h1><p>${companyName} · ${periodLabel} · Generated ${new Date().toLocaleDateString('en-ZA')}</p></div><div class="badge">PeopleOS</div></div>
${body}
<div class="ftr"><span>PeopleOS HR System · ${companyName}</span><span>${periodLabel}</span><span>${new Date().toLocaleString('en-ZA')}</span></div>
</div></body></html>`;
}

async function getCompanyName(companyId) {
  const r = await db.query(`SELECT name FROM companies WHERE id = $1`, [companyId]);
  return r.rows[0]?.name || 'Company';
}

// =====================================================
// EMPLOYEE REGISTER
// =====================================================
exports.exportEmployeesExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT id, first_name, last_name, email, department, position, salary,
              employment_type, is_active, id_number, tax_number, created_at
       FROM employees WHERE company_id = $1 ORDER BY first_name`,
      [companyId]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Employee Register', { tabColor: { argb: 'FF8B5CF6' } });
    ws.columns = [
      { key: 'id',       width: 7  },
      { key: 'name',     width: 28 },
      { key: 'email',    width: 30 },
      { key: 'dept',     width: 20 },
      { key: 'position', width: 22 },
      { key: 'salary',   width: 18 },
      { key: 'type',     width: 16 },
      { key: 'status',   width: 12 },
      { key: 'id_num',   width: 20 },
      { key: 'tax_num',  width: 18 },
    ];
    addTitle(ws, '👥 EMPLOYEE REGISTER', 10, `Year ${year}`, companyName);
    styleHeader(ws.addRow(['ID','Full Name','Email','Department','Position','Salary','Type','Status','ID Number','Tax Number']));

    rows.forEach((e, i) => {
      const row = ws.addRow({
        id: e.id, name: `${e.first_name} ${e.last_name}`, email: e.email,
        dept: e.department || '—', position: e.position || '—',
        salary: toNum(e.salary), type: e.employment_type || '—',
        status: e.is_active ? 'Active' : 'Inactive',
        id_num: e.id_number || '—', tax_num: e.tax_number || '—',
      });
      row.getCell('salary').numFmt = moneyFmt;
      altRow(row, i);
      row.height = 17;
    });

    const total = ws.addRow(['', `TOTAL: ${rows.length} employees`, '', '', '',
      `=SUM(F5:F${4 + rows.length})`, '', '', '', '']);
    total.eachCell(c => Object.assign(c, TOTAL_STYLE));
    total.getCell(6).numFmt = moneyFmt;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="employee-register-${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportEmployeesExcel:', err);
    res.status(500).json({ error: 'Failed to export employee register', details: err.message });
  }
};

exports.exportEmployeesPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT id, first_name, last_name, email, department, position, salary,
              employment_type, is_active, id_number, tax_number
       FROM employees WHERE company_id = $1 ORDER BY first_name`,
      [companyId]
    );

    const active = rows.filter(e => e.is_active).length;
    const totalSalary = rows.reduce((s, e) => s + toNum(e.salary), 0);

    const body = `
    <div class="sec">
      <div class="sec-title">👥 EMPLOYEE REGISTER (${rows.length} employees · ${active} active)</div>
      <table><thead><tr><th>#</th><th>Full Name</th><th>Department</th><th>Position</th><th>Salary</th><th>Type</th><th>Status</th><th>ID Number</th><th>Tax Number</th></tr></thead>
      <tbody>
        ${rows.map((e, i) => `<tr>
          <td>${i+1}</td>
          <td>${e.first_name} ${e.last_name}</td>
          <td>${e.department || '—'}</td>
          <td>${e.position || '—'}</td>
          <td class="r">R ${formatMoney(e.salary)}</td>
          <td>${e.employment_type || '—'}</td>
          <td><span class="${e.is_active ? 'badge-ok' : 'badge-bad'}">${e.is_active ? 'Active' : 'Inactive'}</span></td>
          <td>${e.id_number || '—'}</td>
          <td>${e.tax_number || '—'}</td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="4"><strong>TOTAL</strong></td><td class="r"><strong>R ${formatMoney(totalSalary)}</strong></td><td colspan="4"></td></tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('👥 Employee Register', companyName, `Year ${year}`, body));
  } catch (err) {
    console.error('exportEmployeesPDF:', err);
    res.status(500).json({ error: 'Failed to export employee register PDF', details: err.message });
  }
};

// =====================================================
// HEADCOUNT BY DEPARTMENT
// =====================================================
exports.exportHeadcountExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT department,
              COUNT(*) FILTER (WHERE is_active = true)::int  AS active,
              COUNT(*) FILTER (WHERE is_active = false)::int AS inactive,
              COUNT(*)::int AS total,
              COALESCE(ROUND(AVG(salary) FILTER (WHERE is_active=true), 2), 0) AS avg_salary,
              COALESCE(ROUND(SUM(salary) FILTER (WHERE is_active=true), 2), 0) AS total_salary
       FROM employees WHERE company_id = $1
       GROUP BY department ORDER BY total DESC`,
      [companyId]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Headcount', { tabColor: { argb: 'FF8B5CF6' } });
    ws.columns = [
      { key: 'dept',    width: 24 },
      { key: 'active',  width: 12 },
      { key: 'inactive',width: 12 },
      { key: 'total',   width: 10 },
      { key: 'avg_sal', width: 20 },
      { key: 'tot_sal', width: 22 },
    ];
    addTitle(ws, '🏢 HEADCOUNT BY DEPARTMENT', 6, `Year ${year}`, companyName);
    styleHeader(ws.addRow(['Department','Active','Inactive','Total','Avg Salary','Total Salary']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        dept: r.department || 'Unassigned',
        active: r.active, inactive: r.inactive, total: r.total,
        avg_sal: toNum(r.avg_salary), tot_sal: toNum(r.total_salary),
      });
      row.getCell('avg_sal').numFmt = moneyFmt;
      row.getCell('tot_sal').numFmt = moneyFmt;
      altRow(row, i);
      row.height = 17;
    });

    const s = 5, e2 = 4 + rows.length;
    const tot = ws.addRow([`TOTAL: ${rows.length} departments`,
      `=SUM(B${s}:B${e2})`, `=SUM(C${s}:C${e2})`, `=SUM(D${s}:D${e2})`,
      '', `=SUM(F${s}:F${e2})`]);
    tot.eachCell(c => Object.assign(c, TOTAL_STYLE));
    tot.getCell(6).numFmt = moneyFmt;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="headcount-by-dept-${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportHeadcountExcel:', err);
    res.status(500).json({ error: 'Failed to export headcount report', details: err.message });
  }
};

exports.exportHeadcountPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT department,
              COUNT(*) FILTER (WHERE is_active = true)::int  AS active,
              COUNT(*) FILTER (WHERE is_active = false)::int AS inactive,
              COUNT(*)::int AS total,
              COALESCE(ROUND(AVG(salary) FILTER (WHERE is_active=true),2),0) AS avg_salary,
              COALESCE(ROUND(SUM(salary) FILTER (WHERE is_active=true),2),0) AS total_salary
       FROM employees WHERE company_id = $1
       GROUP BY department ORDER BY total DESC`,
      [companyId]
    );

    const totalEmp = rows.reduce((s, r) => s + r.total, 0);
    const body = `
    <div class="sec">
      <div class="sec-title">🏢 HEADCOUNT BY DEPARTMENT</div>
      <table><thead><tr><th>Department</th><th>Active</th><th>Inactive</th><th>Total</th><th>Avg Salary</th><th>Total Salary</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `<tr>
          <td>${r.department || 'Unassigned'}</td>
          <td>${r.active}</td>
          <td>${r.inactive}</td>
          <td><strong>${r.total}</strong></td>
          <td class="r">R ${formatMoney(r.avg_salary)}</td>
          <td class="r">R ${formatMoney(r.total_salary)}</td>
        </tr>`).join('')}
        <tr class="tot">
          <td><strong>TOTAL</strong></td>
          <td><strong>${rows.reduce((s,r)=>s+r.active,0)}</strong></td>
          <td><strong>${rows.reduce((s,r)=>s+r.inactive,0)}</strong></td>
          <td><strong>${totalEmp}</strong></td>
          <td></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.total_salary),0))}</strong></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('🏢 Headcount by Department', companyName, `Year ${year}`, body));
  } catch (err) {
    console.error('exportHeadcountPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// PAYROLL SUMMARY (monthly)
// =====================================================
exports.exportPayrollSummaryExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT pr.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
       WHERE pr.company_id=$1 AND pr.year=$2 AND pr.month=$3
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Payroll Summary', { tabColor: { argb: 'FFF59E0B' } });
    ws.columns = [
      { key: 'name',   width: 28 }, { key: 'dept',   width: 18 },
      { key: 'basic',  width: 18 }, { key: 'allow',  width: 16 },
      { key: 'bonus',  width: 14 }, { key: 'ot',     width: 14 },
      { key: 'gross',  width: 18 }, { key: 'paye',   width: 16 },
      { key: 'uif',    width: 14 }, { key: 'pension',width: 14 },
      { key: 'net',    width: 18 }, { key: 'status', width: 13 },
    ];
    addTitle(ws, '💰 PAYROLL SUMMARY', 12, periodLabel, companyName);
    styleHeader(ws.addRow(['Employee','Department','Basic Salary','Allowances','Bonuses','Overtime','Gross Pay','PAYE','UIF','Pension','Net Pay','Status']));

    rows.forEach((p, i) => {
      const row = ws.addRow({
        name: p.employee_name, dept: p.department || '—',
        basic: toNum(p.basic_salary), allow: toNum(p.allowances),
        bonus: toNum(p.bonuses), ot: toNum(p.overtime),
        gross: toNum(p.gross_pay), paye: toNum(p.tax),
        uif: toNum(p.uif), pension: toNum(p.pension_employee),
        net: toNum(p.net_pay), status: p.status,
      });
      ['basic','allow','bonus','ot','gross','paye','uif','pension','net'].forEach(k => row.getCell(k).numFmt = moneyFmt);
      altRow(row, i);
      row.height = 17;
    });

    const s = 5, e2 = 4 + rows.length;
    const tot = ws.addRow([`TOTALS: ${rows.length} employees`, '',
      `=SUM(C${s}:C${e2})`, `=SUM(D${s}:D${e2})`, `=SUM(E${s}:E${e2})`,
      `=SUM(F${s}:F${e2})`, `=SUM(G${s}:G${e2})`, `=SUM(H${s}:H${e2})`,
      `=SUM(I${s}:I${e2})`, `=SUM(J${s}:J${e2})`, `=SUM(K${s}:K${e2})`, '']);
    tot.eachCell(c => Object.assign(c, TOTAL_STYLE));
    ['C','D','E','F','G','H','I','J','K'].forEach(col => tot.getCell(col).numFmt = moneyFmt);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-summary-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportPayrollSummaryExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportPayrollSummaryPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT pr.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
       WHERE pr.company_id=$1 AND pr.year=$2 AND pr.month=$3
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const tGross = rows.reduce((s,r) => s + toNum(r.gross_pay), 0);
    const tPaye  = rows.reduce((s,r) => s + toNum(r.tax), 0);
    const tUif   = rows.reduce((s,r) => s + toNum(r.uif), 0);
    const tNet   = rows.reduce((s,r) => s + toNum(r.net_pay), 0);

    const body = `
    <div class="sec">
      <div class="sec-title">💰 PAYROLL SUMMARY — ${periodLabel} (${rows.length} employees)</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>Basic</th><th>Allowances</th><th>Overtime</th><th>Gross</th><th>PAYE</th><th>UIF</th><th>Net Pay</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(p => `<tr>
          <td>${p.employee_name}</td>
          <td>${p.department||'—'}</td>
          <td class="r">R ${formatMoney(p.basic_salary)}</td>
          <td class="r">R ${formatMoney(p.allowances)}</td>
          <td class="r">R ${formatMoney(p.overtime)}</td>
          <td class="r">R ${formatMoney(p.gross_pay)}</td>
          <td class="r">R ${formatMoney(p.tax)}</td>
          <td class="r">R ${formatMoney(p.uif)}</td>
          <td class="r">R ${formatMoney(p.net_pay)}</td>
          <td><span class="badge-${p.status==='paid'?'ok':p.status==='processed'?'info':'warn'}">${p.status}</span></td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="5"><strong>TOTALS</strong></td>
          <td class="r"><strong>R ${formatMoney(tGross)}</strong></td>
          <td class="r"><strong>R ${formatMoney(tPaye)}</strong></td>
          <td class="r"><strong>R ${formatMoney(tUif)}</strong></td>
          <td class="r"><strong>R ${formatMoney(tNet)}</strong></td>
          <td></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('💰 Payroll Summary', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportPayrollSummaryPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// PAYROLL DETAILED BREAKDOWN
// =====================================================
exports.exportPayrollDetailedExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT pr.*, e.first_name||' '||e.last_name AS employee_name, e.department,
              e.id_number, e.tax_number, e.employment_type
       FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
       WHERE pr.company_id=$1 AND pr.year=$2 AND pr.month=$3
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Payroll Detail', { tabColor: { argb: 'FFF59E0B' } });
    ws.columns = [
      { key: 'name',    width: 26 }, { key: 'dept',    width: 16 },
      { key: 'id_num',  width: 18 }, { key: 'tax_num', width: 16 },
      { key: 'basic',   width: 16 }, { key: 'allow',   width: 14 },
      { key: 'bonus',   width: 12 }, { key: 'night',   width: 14 },
      { key: 'ot',      width: 14 }, { key: 'gross',   width: 16 },
      { key: 'paye',    width: 14 }, { key: 'uif',     width: 12 },
      { key: 'pension', width: 14 }, { key: 'other_d', width: 14 },
      { key: 'net',     width: 16 }, { key: 'status',  width: 12 },
      { key: 'payment', width: 14 },
    ];
    addTitle(ws, '🧾 PAYROLL DETAILED BREAKDOWN', 17, periodLabel, companyName);
    styleHeader(ws.addRow(['Employee','Dept','ID Number','Tax Number','Basic','Allowances','Bonuses','Night Pay','Overtime','Gross','PAYE','UIF','Pension','Other Ded.','Net Pay','Status','Payment Method']));

    rows.forEach((p, i) => {
      const row = ws.addRow({
        name: p.employee_name, dept: p.department || '—',
        id_num: p.id_number || '—', tax_num: p.tax_number || '—',
        basic: toNum(p.basic_salary), allow: toNum(p.allowances),
        bonus: toNum(p.bonuses), night: toNum(p.night_pay),
        ot: toNum(p.overtime), gross: toNum(p.gross_pay),
        paye: toNum(p.tax), uif: toNum(p.uif),
        pension: toNum(p.pension_employee),
        other_d: toNum(p.other_deductions),
        net: toNum(p.net_pay), status: p.status,
        payment: p.payment_method || '—',
      });
      ['basic','allow','bonus','night','ot','gross','paye','uif','pension','other_d','net'].forEach(k => row.getCell(k).numFmt = moneyFmt);
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-detailed-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportPayrollDetailedExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportPayrollDetailedPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT pr.*, e.first_name||' '||e.last_name AS employee_name, e.department,
              e.id_number, e.tax_number
       FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
       WHERE pr.company_id=$1 AND pr.year=$2 AND pr.month=$3
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">🧾 PAYROLL DETAILED BREAKDOWN — ${periodLabel}</div>
      <table><thead><tr><th>Employee</th><th>ID No.</th><th>Tax No.</th><th>Basic</th><th>Allow.</th><th>Night</th><th>OT</th><th>Gross</th><th>PAYE</th><th>UIF</th><th>Pension</th><th>Net Pay</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(p => `<tr>
          <td>${p.employee_name}<br><small style="color:#64748b">${p.department||'—'}</small></td>
          <td>${p.id_number||'—'}</td>
          <td>${p.tax_number||'—'}</td>
          <td class="r">R ${formatMoney(p.basic_salary)}</td>
          <td class="r">R ${formatMoney(p.allowances)}</td>
          <td class="r">R ${formatMoney(p.night_pay)}</td>
          <td class="r">R ${formatMoney(p.overtime)}</td>
          <td class="r"><strong>R ${formatMoney(p.gross_pay)}</strong></td>
          <td class="r">R ${formatMoney(p.tax)}</td>
          <td class="r">R ${formatMoney(p.uif)}</td>
          <td class="r">R ${formatMoney(p.pension_employee)}</td>
          <td class="r"><strong>R ${formatMoney(p.net_pay)}</strong></td>
          <td><span class="badge-${p.status==='paid'?'ok':p.status==='processed'?'info':'warn'}">${p.status}</span></td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('🧾 Payroll Detailed Breakdown', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportPayrollDetailedPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// PAYROLL YEAR-TO-DATE
// =====================================================
exports.exportPayrollYTDExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `Jan–${shortMonths[month]} ${year} (YTD)`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COALESCE(SUM(pr.gross_pay),0)       AS ytd_gross,
              COALESCE(SUM(pr.tax),0)             AS ytd_paye,
              COALESCE(SUM(pr.uif),0)             AS ytd_uif,
              COALESCE(SUM(pr.pension_employee),0) AS ytd_pension,
              COALESCE(SUM(pr.net_pay),0)         AS ytd_net,
              COUNT(pr.id)::int                   AS months_paid
       FROM employees e
       LEFT JOIN payroll_records pr ON pr.employee_id = e.id
         AND pr.company_id=$1 AND pr.year=$2 AND pr.month <= $3
         AND pr.status IN ('processed','paid')
       WHERE e.company_id=$1
       GROUP BY e.id, e.first_name, e.last_name, e.department
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('YTD Payroll', { tabColor: { argb: 'FFF59E0B' } });
    ws.columns = [
      { key: 'name',    width: 28 }, { key: 'dept',    width: 18 },
      { key: 'gross',   width: 18 }, { key: 'paye',    width: 16 },
      { key: 'uif',     width: 14 }, { key: 'pension', width: 16 },
      { key: 'net',     width: 18 }, { key: 'months',  width: 14 },
    ];
    addTitle(ws, '📊 PAYROLL YEAR-TO-DATE', 8, periodLabel, companyName);
    styleHeader(ws.addRow(['Employee','Department','YTD Gross','YTD PAYE','YTD UIF','YTD Pension','YTD Net Pay','Months Paid']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        name: r.employee_name, dept: r.department || '—',
        gross: toNum(r.ytd_gross), paye: toNum(r.ytd_paye),
        uif: toNum(r.ytd_uif), pension: toNum(r.ytd_pension),
        net: toNum(r.ytd_net), months: r.months_paid,
      });
      ['gross','paye','uif','pension','net'].forEach(k => row.getCell(k).numFmt = moneyFmt);
      altRow(row, i);
      row.height = 17;
    });

    const s = 5, e2 = 4 + rows.length;
    const tot = ws.addRow([`TOTALS: ${rows.length} employees`, '',
      `=SUM(C${s}:C${e2})`, `=SUM(D${s}:D${e2})`, `=SUM(E${s}:E${e2})`,
      `=SUM(F${s}:F${e2})`, `=SUM(G${s}:G${e2})`, '']);
    tot.eachCell(c => Object.assign(c, TOTAL_STYLE));
    ['C','D','E','F','G'].forEach(col => tot.getCell(col).numFmt = moneyFmt);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-ytd-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportPayrollYTDExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportPayrollYTDPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `Jan–${shortMonths[month]} ${year} (YTD)`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COALESCE(SUM(pr.gross_pay),0) AS ytd_gross,
              COALESCE(SUM(pr.tax),0) AS ytd_paye,
              COALESCE(SUM(pr.uif),0) AS ytd_uif,
              COALESCE(SUM(pr.net_pay),0) AS ytd_net,
              COUNT(pr.id)::int AS months_paid
       FROM employees e
       LEFT JOIN payroll_records pr ON pr.employee_id = e.id
         AND pr.company_id=$1 AND pr.year=$2 AND pr.month<=$3
         AND pr.status IN ('processed','paid')
       WHERE e.company_id=$1
       GROUP BY e.id, e.first_name, e.last_name, e.department
       ORDER BY e.first_name`,
      [companyId, year, month]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">📊 PAYROLL YEAR-TO-DATE — ${periodLabel}</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>YTD Gross</th><th>YTD PAYE</th><th>YTD UIF</th><th>YTD Net Pay</th><th>Months Paid</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.employee_name}</td><td>${r.department||'—'}</td>
          <td class="r">R ${formatMoney(r.ytd_gross)}</td>
          <td class="r">R ${formatMoney(r.ytd_paye)}</td>
          <td class="r">R ${formatMoney(r.ytd_uif)}</td>
          <td class="r"><strong>R ${formatMoney(r.ytd_net)}</strong></td>
          <td>${r.months_paid}</td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="2"><strong>TOTALS</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.ytd_gross),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.ytd_paye),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.ytd_uif),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.ytd_net),0))}</strong></td>
          <td></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('📊 Payroll Year-to-Date', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportPayrollYTDPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// ATTENDANCE MONTHLY
// =====================================================
exports.exportAttendanceMonthlyExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COUNT(ar.id)::int                          AS days_recorded,
              COALESCE(SUM(ar.total_hours),0)            AS total_hours,
              COALESCE(SUM(ar.overtime_hours),0)         AS overtime_hours,
              COUNT(ar.id) FILTER (WHERE ar.status='late')::int AS late_count,
              COUNT(ar.id) FILTER (WHERE ar.status='absent')::int AS absent_count
       FROM employees e
       LEFT JOIN attendance_records ar ON ar.employee_id = e.id
         AND ar.company_id=$1
         AND EXTRACT(MONTH FROM ar.date)=$2
         AND EXTRACT(YEAR FROM ar.date)=$3
       WHERE e.company_id=$1 AND e.is_active=true
       GROUP BY e.id, e.first_name, e.last_name, e.department
       ORDER BY e.first_name`,
      [companyId, month, year]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Attendance', { tabColor: { argb: 'FF3B82F6' } });
    ws.columns = [
      { key: 'name',    width: 28 }, { key: 'dept',  width: 18 },
      { key: 'days',    width: 14 }, { key: 'hours', width: 14 },
      { key: 'ot',      width: 14 }, { key: 'late',  width: 12 },
      { key: 'absent',  width: 12 },
    ];
    addTitle(ws, '🕐 MONTHLY ATTENDANCE REPORT', 7, periodLabel, companyName);
    styleHeader(ws.addRow(['Employee','Department','Days Recorded','Total Hours','Overtime Hours','Late Days','Absent Days']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        name: r.employee_name, dept: r.department || '—',
        days: r.days_recorded, hours: round2(r.total_hours),
        ot: round2(r.overtime_hours), late: r.late_count, absent: r.absent_count,
      });
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportAttendanceMonthlyExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportAttendanceMonthlyPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COUNT(ar.id)::int AS days_recorded,
              COALESCE(SUM(ar.total_hours),0) AS total_hours,
              COALESCE(SUM(ar.overtime_hours),0) AS overtime_hours,
              COUNT(ar.id) FILTER (WHERE ar.status='late')::int AS late_count,
              COUNT(ar.id) FILTER (WHERE ar.status='absent')::int AS absent_count
       FROM employees e
       LEFT JOIN attendance_records ar ON ar.employee_id = e.id
         AND ar.company_id=$1 AND EXTRACT(MONTH FROM ar.date)=$2 AND EXTRACT(YEAR FROM ar.date)=$3
       WHERE e.company_id=$1 AND e.is_active=true
       GROUP BY e.id, e.first_name, e.last_name, e.department ORDER BY e.first_name`,
      [companyId, month, year]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">🕐 MONTHLY ATTENDANCE — ${periodLabel}</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>Days</th><th>Total Hours</th><th>Overtime</th><th>Late Days</th><th>Absent Days</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.employee_name}</td><td>${r.department||'—'}</td>
          <td>${r.days_recorded}</td><td>${round2(r.total_hours)}</td>
          <td>${round2(r.overtime_hours)}</td>
          <td><span class="${r.late_count>0?'badge-warn':'badge-ok'}">${r.late_count}</span></td>
          <td><span class="${r.absent_count>0?'badge-bad':'badge-ok'}">${r.absent_count}</span></td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('🕐 Monthly Attendance Report', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportAttendanceMonthlyPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// ATTENDANCE BY DATE RANGE
// =====================================================
exports.exportAttendanceRangeExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = req.query.start_date || `${year}-01-01`;
    const endDate   = req.query.end_date   || new Date().toISOString().split('T')[0];
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${startDate} to ${endDate}`;

    const { rows } = await db.query(
      `SELECT ar.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM attendance_records ar JOIN employees e ON e.id = ar.employee_id
       WHERE ar.company_id=$1 AND ar.date BETWEEN $2 AND $3
       ORDER BY ar.date, e.first_name`,
      [companyId, startDate, endDate]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Attendance Range', { tabColor: { argb: 'FF3B82F6' } });
    ws.columns = [
      { key: 'date',     width: 14 }, { key: 'name',    width: 26 },
      { key: 'dept',     width: 18 }, { key: 'in',      width: 12 },
      { key: 'out',      width: 12 }, { key: 'hours',   width: 13 },
      { key: 'ot',       width: 13 }, { key: 'status',  width: 13 },
    ];
    addTitle(ws, '📅 ATTENDANCE BY DATE RANGE', 8, periodLabel, companyName);
    styleHeader(ws.addRow(['Date','Employee','Department','Clock In','Clock Out','Hours','Overtime','Status']));

    rows.forEach((a, i) => {
      const row = ws.addRow({
        date: new Date(a.date).toLocaleDateString('en-ZA'),
        name: a.employee_name, dept: a.department || '—',
        in: a.clock_in  ? new Date(a.clock_in).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) : '—',
        out: a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) : '—',
        hours: round2(a.total_hours), ot: round2(a.overtime_hours),
        status: a.status || '—',
      });
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-range-${startDate}-${endDate}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportAttendanceRangeExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportAttendanceRangePDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startDate = req.query.start_date || `${year}-01-01`;
    const endDate   = req.query.end_date   || new Date().toISOString().split('T')[0];
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${startDate} to ${endDate}`;

    const { rows } = await db.query(
      `SELECT ar.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM attendance_records ar JOIN employees e ON e.id = ar.employee_id
       WHERE ar.company_id=$1 AND ar.date BETWEEN $2 AND $3
       ORDER BY ar.date, e.first_name`,
      [companyId, startDate, endDate]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">📅 ATTENDANCE — ${periodLabel} (${rows.length} records)</div>
      <table><thead><tr><th>Date</th><th>Employee</th><th>Department</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Overtime</th><th>Status</th></tr></thead>
      <tbody>
        ${rows.map(a => `<tr>
          <td>${new Date(a.date).toLocaleDateString('en-ZA')}</td>
          <td>${a.employee_name}</td><td>${a.department||'—'}</td>
          <td>${a.clock_in  ? new Date(a.clock_in).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
          <td>${a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) : '—'}</td>
          <td>${round2(a.total_hours)}</td>
          <td>${round2(a.overtime_hours)}</td>
          <td><span class="badge-${a.status==='present'?'ok':a.status==='late'?'warn':'bad'}">${a.status||'—'}</span></td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('📅 Attendance by Date Range', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportAttendanceRangePDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// OVERTIME REPORT
// =====================================================
exports.exportOvertimeExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COALESCE(SUM(ar.overtime_hours),0) AS ot_hours,
              COALESCE(SUM(pr.overtime),0)        AS ot_pay,
              COALESCE(SUM(pr.gross_pay),0)       AS gross_pay,
              CASE WHEN SUM(pr.gross_pay)>0 THEN ROUND((SUM(pr.overtime)/SUM(pr.gross_pay))*100,2) ELSE 0 END AS ot_pct
       FROM employees e
       LEFT JOIN attendance_records ar ON ar.employee_id=e.id
         AND ar.company_id=$1 AND EXTRACT(MONTH FROM ar.date)=$2 AND EXTRACT(YEAR FROM ar.date)=$3
       LEFT JOIN payroll_records pr ON pr.employee_id=e.id
         AND pr.company_id=$1 AND pr.month=$2 AND pr.year=$3
       WHERE e.company_id=$1 AND e.is_active=true
       GROUP BY e.id, e.first_name, e.last_name, e.department
       HAVING COALESCE(SUM(ar.overtime_hours),0) > 0 OR COALESCE(SUM(pr.overtime),0) > 0
       ORDER BY ot_pay DESC`,
      [companyId, month, year]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Overtime', { tabColor: { argb: 'FFEF4444' } });
    ws.columns = [
      { key: 'name',    width: 28 }, { key: 'dept',   width: 18 },
      { key: 'ot_hrs',  width: 16 }, { key: 'ot_pay', width: 18 },
      { key: 'gross',   width: 18 }, { key: 'ot_pct', width: 16 },
    ];
    addTitle(ws, '⏰ OVERTIME REPORT', 6, periodLabel, companyName);
    styleHeader(ws.addRow(['Employee','Department','Overtime Hours','Overtime Pay','Gross Pay','OT % of Gross']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        name: r.employee_name, dept: r.department||'—',
        ot_hrs: round2(r.ot_hours), ot_pay: toNum(r.ot_pay),
        gross: toNum(r.gross_pay), ot_pct: `${round2(r.ot_pct)}%`,
      });
      row.getCell('ot_pay').numFmt = moneyFmt;
      row.getCell('gross').numFmt  = moneyFmt;
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="overtime-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportOvertimeExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportOvertimePDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              COALESCE(SUM(ar.overtime_hours),0) AS ot_hours,
              COALESCE(SUM(pr.overtime),0) AS ot_pay,
              COALESCE(SUM(pr.gross_pay),0) AS gross_pay
       FROM employees e
       LEFT JOIN attendance_records ar ON ar.employee_id=e.id
         AND ar.company_id=$1 AND EXTRACT(MONTH FROM ar.date)=$2 AND EXTRACT(YEAR FROM ar.date)=$3
       LEFT JOIN payroll_records pr ON pr.employee_id=e.id
         AND pr.company_id=$1 AND pr.month=$2 AND pr.year=$3
       WHERE e.company_id=$1 AND e.is_active=true
       GROUP BY e.id, e.first_name, e.last_name, e.department
       HAVING COALESCE(SUM(ar.overtime_hours),0)>0 OR COALESCE(SUM(pr.overtime),0)>0
       ORDER BY ot_pay DESC`,
      [companyId, month, year]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">⏰ OVERTIME REPORT — ${periodLabel}</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>OT Hours</th><th>OT Pay</th><th>Gross Pay</th><th>OT %</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.employee_name}</td><td>${r.department||'—'}</td>
          <td>${round2(r.ot_hours)}</td>
          <td class="r">R ${formatMoney(r.ot_pay)}</td>
          <td class="r">R ${formatMoney(r.gross_pay)}</td>
          <td>${round2(toNum(r.gross_pay)>0?(toNum(r.ot_pay)/toNum(r.gross_pay))*100:0)}%</td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="3"><strong>TOTALS</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.ot_pay),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(rows.reduce((s,r)=>s+toNum(r.gross_pay),0))}</strong></td>
          <td></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('⏰ Overtime Report', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportOvertimePDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// LEAVE BALANCES
// =====================================================
exports.exportLeaveBalancesExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              lt.name AS leave_type, lb.balance, lb.used_days,
              lb.balance + lb.used_days AS total_entitlement
       FROM leave_balances lb
       JOIN employees e ON e.id = lb.employee_id
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.company_id=$1
       ORDER BY e.first_name, lt.name`,
      [companyId]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Leave Balances', { tabColor: { argb: 'FF10B981' } });
    ws.columns = [
      { key: 'name',    width: 28 }, { key: 'dept',    width: 18 },
      { key: 'type',    width: 20 }, { key: 'total',   width: 16 },
      { key: 'used',    width: 14 }, { key: 'balance', width: 14 },
    ];
    addTitle(ws, '🏖️ LEAVE BALANCES', 6, `As at ${new Date().toLocaleDateString('en-ZA')}`, companyName);
    styleHeader(ws.addRow(['Employee','Department','Leave Type','Total Entitlement','Days Used','Balance Remaining']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        name: r.employee_name, dept: r.department||'—',
        type: r.leave_type, total: toNum(r.total_entitlement),
        used: toNum(r.used_days), balance: toNum(r.balance),
      });
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leave-balances-${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportLeaveBalancesExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportLeaveBalancesPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              lt.name AS leave_type, lb.balance, lb.used_days,
              lb.balance + lb.used_days AS total_entitlement
       FROM leave_balances lb
       JOIN employees e ON e.id = lb.employee_id
       JOIN leave_types lt ON lt.id = lb.leave_type_id
       WHERE lb.company_id=$1
       ORDER BY e.first_name, lt.name`,
      [companyId]
    );

    const body = `
    <div class="sec">
      <div class="sec-title">🏖️ LEAVE BALANCES — As at ${new Date().toLocaleDateString('en-ZA')}</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>Leave Type</th><th>Entitlement</th><th>Used</th><th>Remaining</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${r.employee_name}</td><td>${r.department||'—'}</td>
          <td>${r.leave_type}</td>
          <td>${toNum(r.total_entitlement)}</td>
          <td>${toNum(r.used_days)}</td>
          <td><strong>${toNum(r.balance)}</strong></td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('🏖️ Leave Balances', companyName, `Year ${year}`, body));
  } catch (err) {
    console.error('exportLeaveBalancesPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// LEAVE TAKEN
// =====================================================
exports.exportLeaveTakenExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT lr.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
       WHERE lr.company_id=$1 AND EXTRACT(YEAR FROM lr.start_date)=$2 AND lr.status='approved'
       ORDER BY lr.start_date, e.first_name`,
      [companyId, year]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Leave Taken', { tabColor: { argb: 'FF10B981' } });
    ws.columns = [
      { key: 'name',  width: 28 }, { key: 'dept',   width: 18 },
      { key: 'type',  width: 20 }, { key: 'start',  width: 14 },
      { key: 'end',   width: 14 }, { key: 'days',   width: 10 },
      { key: 'reason',width: 35 },
    ];
    addTitle(ws, '✈️ LEAVE TAKEN REPORT', 7, `Year ${year}`, companyName);
    styleHeader(ws.addRow(['Employee','Department','Leave Type','Start Date','End Date','Days','Reason']));

    rows.forEach((l, i) => {
      const row = ws.addRow({
        name: l.employee_name, dept: l.department||'—',
        type: l.leave_type,
        start: new Date(l.start_date).toLocaleDateString('en-ZA'),
        end: new Date(l.end_date).toLocaleDateString('en-ZA'),
        days: l.days_requested || l.total_days || 0,
        reason: l.reason || '—',
      });
      altRow(row, i);
      row.height = 17;
    });

    const s = 5, e2 = 4 + rows.length;
    const tot = ws.addRow([`TOTAL: ${rows.length} leave requests`, '', '', '', '',
      `=SUM(F${s}:F${e2})`, '']);
    tot.eachCell(c => Object.assign(c, TOTAL_STYLE));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="leave-taken-${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportLeaveTakenExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportLeaveTakenPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT lr.*, e.first_name||' '||e.last_name AS employee_name, e.department
       FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
       WHERE lr.company_id=$1 AND EXTRACT(YEAR FROM lr.start_date)=$2 AND lr.status='approved'
       ORDER BY lr.start_date, e.first_name`,
      [companyId, year]
    );

    const totalDays = rows.reduce((s,r) => s + (r.days_requested || r.total_days || 0), 0);
    const body = `
    <div class="sec">
      <div class="sec-title">✈️ LEAVE TAKEN — Year ${year} (${rows.length} approved requests · ${totalDays} days)</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>Leave Type</th><th>Start</th><th>End</th><th>Days</th></tr></thead>
      <tbody>
        ${rows.map(l => `<tr>
          <td>${l.employee_name}</td><td>${l.department||'—'}</td>
          <td>${l.leave_type}</td>
          <td>${new Date(l.start_date).toLocaleDateString('en-ZA')}</td>
          <td>${new Date(l.end_date).toLocaleDateString('en-ZA')}</td>
          <td><strong>${l.days_requested||l.total_days||0}</strong></td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="5"><strong>TOTAL DAYS</strong></td><td><strong>${totalDays}</strong></td></tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('✈️ Leave Taken Report', companyName, `Year ${year}`, body));
  } catch (err) {
    console.error('exportLeaveTakenPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// SARS EMP201 REPORT
// =====================================================
exports.exportEMP201Excel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const { rows } = await db.query(
      `SELECT * FROM emp201_declarations
       WHERE company_id=$1 AND tax_year=$2 AND tax_period=$3
       ORDER BY tax_period`,
      [companyId, year.toString(), month.toString().padStart(2,'0')]
    );

    // Also pull per-employee detail
    const { rows: detail } = await db.query(
      `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
              pr.gross_pay, pr.tax AS paye, pr.uif,
              COALESCE(pr.gross_pay * 0.01, 0) AS sdl
       FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
       WHERE pr.company_id=$1 AND pr.month=$2 AND pr.year=$3
       ORDER BY e.first_name`,
      [companyId, month, year]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';

    // Sheet 1: Declaration summary
    const ws1 = wb.addWorksheet('EMP201 Declaration', { tabColor: { argb: 'FFEF4444' } });
    ws1.columns = [
      { key: 'field', width: 30 }, { key: 'value', width: 22 },
    ];
    addTitle(ws1, '🏛️ EMP201 PAYE REPORT', 2, periodLabel, companyName);
    styleHeader(ws1.addRow(['Field','Value']));

    if (rows.length > 0) {
      const d = rows[0];
      const fields = [
        ['Tax Year', d.tax_year],
        ['Tax Period', d.tax_period],
        ['Employee Count', d.employee_count],
        ['PAYE Amount', toNum(d.paye_amount)],
        ['SDL Amount', toNum(d.sdl_amount)],
        ['UIF Employee', toNum(d.uif_employee_amount)],
        ['UIF Employer', toNum(d.uif_employer_amount)],
        ['UIF Total', toNum(d.uif_total_amount)],
        ['Total Liability', toNum(d.total_liability)],
        ['Submission Status', d.submission_status],
        ['Payment Status', d.payment_status],
      ];
      fields.forEach(([f, v], i) => {
        const row = ws1.addRow({ field: f, value: v });
        if (typeof v === 'number') row.getCell('value').numFmt = moneyFmt;
        altRow(row, i);
        row.height = 17;
      });
    } else {
      ws1.addRow(['No EMP201 declaration found for this period']);
    }

    // Sheet 2: Per-employee detail
    const ws2 = wb.addWorksheet('Employee Detail', { tabColor: { argb: 'FFEF4444' } });
    ws2.columns = [
      { key: 'name',  width: 28 }, { key: 'dept',  width: 18 },
      { key: 'gross', width: 18 }, { key: 'paye',  width: 16 },
      { key: 'uif',   width: 14 }, { key: 'sdl',   width: 14 },
    ];
    addTitle(ws2, '🏛️ EMP201 — EMPLOYEE DETAIL', 6, periodLabel, companyName);
    styleHeader(ws2.addRow(['Employee','Department','Gross Pay','PAYE','UIF','SDL']));
    detail.forEach((r, i) => {
      const row = ws2.addRow({
        name: r.employee_name, dept: r.department||'—',
        gross: toNum(r.gross_pay), paye: toNum(r.paye),
        uif: toNum(r.uif), sdl: round2(r.sdl),
      });
      ['gross','paye','uif','sdl'].forEach(k => row.getCell(k).numFmt = moneyFmt);
      altRow(row, i);
      row.height = 17;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="emp201-${year}-${month}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportEMP201Excel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportEMP201PDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const companyName = await getCompanyName(companyId);
    const periodLabel = `${fullMonths[month]} ${year}`;

    const [{ rows: decl }, { rows: detail }] = await Promise.all([
      db.query(
        `SELECT * FROM emp201_declarations WHERE company_id=$1 AND tax_year=$2 AND tax_period=$3`,
        [companyId, year.toString(), month.toString().padStart(2,'0')]
      ),
      db.query(
        `SELECT e.first_name||' '||e.last_name AS employee_name, e.department,
                pr.gross_pay, pr.tax AS paye, pr.uif,
                COALESCE(pr.gross_pay * 0.01, 0) AS sdl
         FROM payroll_records pr JOIN employees e ON e.id = pr.employee_id
         WHERE pr.company_id=$1 AND pr.month=$2 AND pr.year=$3
         ORDER BY e.first_name`,
        [companyId, month, year]
      ),
    ]);

    const d = decl[0] || {};
    const body = `
    <div class="sec">
      <div class="sec-title">🏛️ EMP201 PAYE DECLARATION — ${periodLabel}</div>
      <table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>
        <tr><td>Tax Year</td><td>${d.tax_year || year}</td></tr>
        <tr><td>Tax Period</td><td>${d.tax_period || month}</td></tr>
        <tr><td>Employee Count</td><td>${d.employee_count || detail.length}</td></tr>
        <tr><td>PAYE Amount</td><td class="r">R ${formatMoney(d.paye_amount || detail.reduce((s,r)=>s+toNum(r.paye),0))}</td></tr>
        <tr><td>SDL Amount (1%)</td><td class="r">R ${formatMoney(d.sdl_amount || detail.reduce((s,r)=>s+toNum(r.sdl),0))}</td></tr>
        <tr><td>UIF Total</td><td class="r">R ${formatMoney(d.uif_total_amount || detail.reduce((s,r)=>s+toNum(r.uif)*2,0))}</td></tr>
        <tr><td><strong>Total Liability</strong></td><td class="r"><strong>R ${formatMoney(d.total_liability || 0)}</strong></td></tr>
        <tr><td>Submission Status</td><td><span class="badge-${d.submission_status==='submitted'?'ok':'warn'}">${d.submission_status||'draft'}</span></td></tr>
        <tr><td>Payment Status</td><td><span class="badge-${d.payment_status==='paid'?'ok':'warn'}">${d.payment_status||'unpaid'}</span></td></tr>
      </tbody></table>
    </div>
    <div class="sec">
      <div class="sec-title">Employee PAYE Detail (${detail.length} employees)</div>
      <table><thead><tr><th>Employee</th><th>Department</th><th>Gross</th><th>PAYE</th><th>UIF</th><th>SDL</th></tr></thead>
      <tbody>
        ${detail.map(r => `<tr>
          <td>${r.employee_name}</td><td>${r.department||'—'}</td>
          <td class="r">R ${formatMoney(r.gross_pay)}</td>
          <td class="r">R ${formatMoney(r.paye)}</td>
          <td class="r">R ${formatMoney(r.uif)}</td>
          <td class="r">R ${formatMoney(r.sdl)}</td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="2"><strong>TOTALS</strong></td>
          <td class="r"><strong>R ${formatMoney(detail.reduce((s,r)=>s+toNum(r.gross_pay),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(detail.reduce((s,r)=>s+toNum(r.paye),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(detail.reduce((s,r)=>s+toNum(r.uif),0))}</strong></td>
          <td class="r"><strong>R ${formatMoney(detail.reduce((s,r)=>s+toNum(r.sdl),0))}</strong></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('🏛️ EMP201 PAYE Report', companyName, periodLabel, body));
  } catch (err) {
    console.error('exportEMP201PDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

// =====================================================
// SARS TAX LIABILITY SUMMARY
// =====================================================
exports.exportTaxLiabilityExcel = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT tax_period, employee_count, paye_amount, sdl_amount,
              uif_employee_amount, uif_employer_amount, uif_total_amount,
              total_liability, submission_status, payment_status
       FROM emp201_declarations WHERE company_id=$1 AND tax_year=$2
       ORDER BY tax_period`,
      [companyId, year.toString()]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PeopleOS';
    const ws = wb.addWorksheet('Tax Liability', { tabColor: { argb: 'FFEF4444' } });
    ws.columns = [
      { key: 'period',  width: 12 }, { key: 'emps',  width: 12 },
      { key: 'paye',    width: 18 }, { key: 'sdl',   width: 16 },
      { key: 'uif_e',   width: 16 }, { key: 'uif_er',width: 16 },
      { key: 'uif_tot', width: 16 }, { key: 'total', width: 18 },
      { key: 'sub',     width: 16 }, { key: 'pay',   width: 14 },
    ];
    addTitle(ws, '📑 TAX LIABILITY SUMMARY', 10, `Year ${year}`, companyName);
    styleHeader(ws.addRow(['Period','Employees','PAYE','SDL','UIF Employee','UIF Employer','UIF Total','Total Liability','Submitted','Paid']));

    rows.forEach((r, i) => {
      const row = ws.addRow({
        period: `${shortMonths[parseInt(r.tax_period)]} ${year}`,
        emps: r.employee_count,
        paye: toNum(r.paye_amount), sdl: toNum(r.sdl_amount),
        uif_e: toNum(r.uif_employee_amount), uif_er: toNum(r.uif_employer_amount),
        uif_tot: toNum(r.uif_total_amount), total: toNum(r.total_liability),
        sub: r.submission_status, pay: r.payment_status,
      });
      ['paye','sdl','uif_e','uif_er','uif_tot','total'].forEach(k => row.getCell(k).numFmt = moneyFmt);
      altRow(row, i);
      row.height = 17;
    });

    if (rows.length > 0) {
      const s = 5, e2 = 4 + rows.length;
      const tot = ws.addRow([`YTD TOTALS`, '',
        `=SUM(C${s}:C${e2})`, `=SUM(D${s}:D${e2})`,
        `=SUM(E${s}:E${e2})`, `=SUM(F${s}:F${e2})`,
        `=SUM(G${s}:G${e2})`, `=SUM(H${s}:H${e2})`, '', '']);
      tot.eachCell(c => Object.assign(c, TOTAL_STYLE));
      ['C','D','E','F','G','H'].forEach(col => tot.getCell(col).numFmt = moneyFmt);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="tax-liability-${year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('exportTaxLiabilityExcel:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};

exports.exportTaxLiabilityPDF = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const companyName = await getCompanyName(companyId);

    const { rows } = await db.query(
      `SELECT tax_period, employee_count, paye_amount, sdl_amount,
              uif_total_amount, total_liability, submission_status, payment_status
       FROM emp201_declarations WHERE company_id=$1 AND tax_year=$2
       ORDER BY tax_period`,
      [companyId, year.toString()]
    );

    const ytdPaye  = rows.reduce((s,r) => s + toNum(r.paye_amount), 0);
    const ytdSdl   = rows.reduce((s,r) => s + toNum(r.sdl_amount), 0);
    const ytdUif   = rows.reduce((s,r) => s + toNum(r.uif_total_amount), 0);
    const ytdTotal = rows.reduce((s,r) => s + toNum(r.total_liability), 0);

    const body = `
    <div class="sec">
      <div class="sec-title">📑 TAX LIABILITY SUMMARY — Year ${year}</div>
      <table><thead><tr><th>Period</th><th>Employees</th><th>PAYE</th><th>SDL</th><th>UIF Total</th><th>Total Liability</th><th>Submitted</th><th>Paid</th></tr></thead>
      <tbody>
        ${rows.map(r => `<tr>
          <td>${shortMonths[parseInt(r.tax_period)]} ${year}</td>
          <td>${r.employee_count}</td>
          <td class="r">R ${formatMoney(r.paye_amount)}</td>
          <td class="r">R ${formatMoney(r.sdl_amount)}</td>
          <td class="r">R ${formatMoney(r.uif_total_amount)}</td>
          <td class="r"><strong>R ${formatMoney(r.total_liability)}</strong></td>
          <td><span class="badge-${r.submission_status==='submitted'?'ok':'warn'}">${r.submission_status}</span></td>
          <td><span class="badge-${r.payment_status==='paid'?'ok':'warn'}">${r.payment_status}</span></td>
        </tr>`).join('')}
        <tr class="tot"><td colspan="2"><strong>YTD TOTALS</strong></td>
          <td class="r"><strong>R ${formatMoney(ytdPaye)}</strong></td>
          <td class="r"><strong>R ${formatMoney(ytdSdl)}</strong></td>
          <td class="r"><strong>R ${formatMoney(ytdUif)}</strong></td>
          <td class="r"><strong>R ${formatMoney(ytdTotal)}</strong></td>
          <td colspan="2"></td>
        </tr>
      </tbody></table>
    </div>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(pdfWrapper('📑 Tax Liability Summary', companyName, `Year ${year}`, body));
  } catch (err) {
    console.error('exportTaxLiabilityPDF:', err);
    res.status(500).json({ error: 'Failed', details: err.message });
  }
};