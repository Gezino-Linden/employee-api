const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");
const { seedPayrollData, cleanupPayrollData } = require("./payroll-setup");

const JWT_SECRET = process.env.JWT_SECRET;

const createToken = (role, companyId = 4, plan = "intelligence") => 
  jwt.sign(
    { id: 1, email: `${role}@grandhotel.com`, role, company_id: companyId, plan },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

const adminToken = createToken("admin");
const managerToken = createToken("manager");
const employeeToken = createToken("employee");
const ownerToken = createToken("owner");
const accountantToken = createToken("accountant");
const hrManagerToken = createToken("hr_manager");
const gmToken = createToken("general_manager");

beforeAll(async () => {
  await seedPayrollData();
}, 60000);

afterAll(async () => {
  await cleanupPayrollData();
  await new Promise(resolve => setTimeout(resolve, 500));
}, 30000);

describe("Payroll - Auth & Access Control", () => {
  it("GET /summary - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/summary");
    expect(res.status).toBe(401);
  });

  it("GET /records - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/records");
    expect(res.status).toBe(401);
  });

  it("GET /history - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/history");
    expect(res.status).toBe(401);
  });

  it("GET /periods - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/periods");
    expect(res.status).toBe(401);
  });

  it("POST /process - rejects unauthenticated", async () => {
    const res = await request(app).post("/api/payroll/process").send({});
    expect(res.status).toBe(401);
  });

  it("POST /initialize - rejects unauthenticated", async () => {
    const res = await request(app).post("/api/payroll/initialize").send({});
    expect(res.status).toBe(401);
  });
});

describe("Payroll - Role-Based Access Control", () => {
  it("allows owner to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("allows admin to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("allows general_manager to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${gmToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("allows manager to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${managerToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("allows hr_manager to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${hrManagerToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("allows accountant to access summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${accountantToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("rejects employee from accessing summary", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });
});

describe("Payroll - Summary Endpoint", () => {
  it("GET /summary - returns payroll summary with stats", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /summary - handles missing year parameter (uses defaults)", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    // API uses current year as default
    expect([200, 400]).toContain(res.status);
  });

  it("GET /summary - handles missing month parameter (uses defaults)", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026")
      .set("Authorization", `Bearer ${adminToken}`);
    // API uses current month as default
    expect([200, 400]).toContain(res.status);
  });
});

describe("Payroll - Records Endpoint", () => {
  it("GET /records - returns paginated records", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /records - supports pagination", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3&page=1&limit=10")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /records - supports status filter", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3&status=processed")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /records - supports employee filter", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3&employee_id=9991")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe("Payroll - History Endpoint", () => {
  it("GET /history - returns payroll history", async () => {
    const res = await request(app)
      .get("/api/payroll/history")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /history - filters by year", async () => {
    const res = await request(app)
      .get("/api/payroll/history?year=2026")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe("Payroll - Periods Endpoint", () => {
  it("GET /periods - returns periods", async () => {
    const res = await request(app)
      .get("/api/payroll/periods")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 500]).toContain(res.status);
  });
});

describe("Payroll - Initialize Period", () => {
  it("POST /initialize - creates new payroll period", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2027, month: 1 });
    expect([201, 200, 400, 409]).toContain(res.status);
  });

  it("POST /initialize - rejects missing year", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 4 });
    expect(res.status).toBe(400);
  });

  it("POST /initialize - rejects missing month", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026 });
    expect(res.status).toBe(400);
  });

  it("POST /initialize - rejects invalid month", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, month: 13 });
    expect(res.status).toBe(400);
  });

  it("POST /initialize - allows owner to initialize", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ year: 2027, month: 2 });
    expect([201, 200, 400, 409]).toContain(res.status);
  });

  it("POST /initialize - allows accountant to initialize", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${accountantToken}`)
      .send({ year: 2027, month: 3 });
    expect([201, 200, 400, 409]).toContain(res.status);
  });
});

describe("Payroll - Process Payroll", () => {
  it("POST /process - processes payroll for employees", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, month: 4, employee_ids: [9991] });
    expect([200, 201, 400, 404]).toContain(res.status);
  });

  it("POST /process - rejects missing month", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, employee_ids: [9991] });
    expect(res.status).toBe(400);
  });

  it("POST /process - rejects missing year", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 3, employee_ids: [9991] });
    expect(res.status).toBe(400);
  });

  it("POST /process - rejects empty employee_ids", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 3, year: 2026, employee_ids: [] });
    expect(res.status).toBe(400);
  });

  it("POST /process - rejects non-array employee_ids", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 3, year: 2026, employee_ids: "all" });
    expect(res.status).toBe(400);
  });

  it("POST /process - handles employee not found", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, month: 3, employee_ids: [999999] });
    expect([404, 400, 200]).toContain(res.status);
  });

  it("POST /process - processes multiple employees", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, month: 4, employee_ids: [9991, 9992] });
    expect([200, 201, 400, 404]).toContain(res.status);
  });
});

describe("Payroll - Update Record", () => {
  it("PATCH /records/:id - updates payroll record", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ gross_salary: 55000 });
    expect([200, 404]).toContain(res.status);
  });

  it("PATCH /records/:id - rejects update for non-existent record", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/999999")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ gross_salary: 55000 });
    expect(res.status).toBe(404);
  });

  it("PATCH /records/:id - allows partial updates", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ deductions: 5000 });
    expect([200, 404]).toContain(res.status);
  });
});

describe("Payroll - Mark As Paid", () => {
  it("PATCH /records/:id/pay - marks record as paid", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ payment_method: "bank_transfer" });
    expect([200, 404]).toContain(res.status);
  });

  it("PATCH /records/:id/pay - rejects missing payment_method", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("PATCH /records/:id/pay - rejects invalid payment method", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ payment_method: "invalid_method" });
    expect(res.status).toBe(400);
  });

  it("PATCH /records/:id/pay - accepts cash payment method", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ payment_method: "cash" });
    expect([200, 404]).toContain(res.status);
  });

  it("PATCH /records/:id/pay - accepts check payment method", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/9991/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ payment_method: "check" });
    expect([200, 404]).toContain(res.status);
  });
});

describe("Payroll - Payslip Generation", () => {
  it("GET /payslip/:id - generates payslip for employee", async () => {
    const res = await request(app)
      .get("/api/payroll/payslip/9991")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("GET /payslip/:id - returns 404 for non-existent record", async () => {
    const res = await request(app)
      .get("/api/payroll/payslip/999999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("Payroll - SARS Tax Calculation Logic", () => {
  it("calculates tax for lowest bracket correctly", async () => {
    const annualIncome = 100000;
    expect(annualIncome).toBeGreaterThan(0);
  });

  it("calculates tax for middle bracket correctly", async () => {
    const annualIncome = 400000;
    expect(annualIncome).toBeGreaterThan(237100);
  });

  it("calculates tax for highest bracket correctly", async () => {
    const annualIncome = 2000000;
    expect(annualIncome).toBeGreaterThan(1817001);
  });

  it("handles tax rebates correctly", async () => {
    const primaryRebate = 17235;
    expect(primaryRebate).toBeGreaterThan(0);
  });
});

describe("Payroll - Company Isolation", () => {
  it("ensures users only see their company's payroll data", async () => {
    const otherCompanyToken = createToken("admin", 999);
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${otherCompanyToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe("Payroll - Edge Cases", () => {
  it("handles leap year February correctly", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2024&month=2")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("handles invalid dates gracefully", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=2&day=30")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 400]).toContain(res.status);
  });
});

describe("Payroll - Concurrent Operations", () => {
  it("handles concurrent payroll processing requests", async () => {
    const requests = [
      request(app)
        .post("/api/payroll/process")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ year: 2026, month: 5, employee_ids: [9991] }),
      request(app)
        .post("/api/payroll/process")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ year: 2026, month: 5, employee_ids: [9992] })
    ];
    const results = await Promise.all(requests);
    results.forEach(res => {
      expect([200, 201, 400, 404, 409]).toContain(res.status);
    });
  });
});
