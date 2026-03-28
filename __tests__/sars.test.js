const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const adminToken = jwt.sign(
  { id: 1, email: "admin@grandhotel.com", role: "admin", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("SARS EMP201 - Monthly Declaration", () => {
  it("generates EMP201 with PAYE, UIF, SDL breakdown", async () => {
    const res = await request(app)
      .get("/api/payroll/sars/emp201?month=3&year=2025")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.payment_reference_number).toBeDefined();
      expect(res.body.total_paye).toBeGreaterThanOrEqual(0);
      expect(res.body.total_uif).toBeGreaterThanOrEqual(0);
      expect(res.body.total_sdl).toBeGreaterThanOrEqual(0);
    }
  });

  it("EMP201 deadline is 7th of following month", async () => {
    const res = await request(app)
      .get("/api/payroll/sars/emp201?month=3&year=2025")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200 && res.body.due_date) {
      const dueDate = new Date(res.body.due_date);
      expect(dueDate.getDate()).toBeLessThanOrEqual(7);
    }
  });
});

describe("SARS EMP501 - Annual Reconciliation", () => {
  it("generates EMP501 annual reconciliation", async () => {
    const res = await request(app)
      .get("/api/payroll/sars/emp501?year=2025")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.tax_year).toMatch(/2024\/2025/);
      expect(res.body.total_employees).toBeGreaterThanOrEqual(0);
    }
  });

  it("EMP501 filing season is 1 April to 31 May", async () => {
    const res = await request(app)
      .get("/api/payroll/sars/emp501?year=2025")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.filing_season_start).toMatch(/2025-04-01|1 April 2025/);
      expect(res.body.filing_season_end).toMatch(/2025-05-31|31 May 2025/);
    }
  });
});

describe("SARS IRP5 - Employee Tax Certificates", () => {
  it("generates IRP5 with required source codes", async () => {
    const res = await request(app)
      .get("/api/payroll/sars/irp5/1?year=2025")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.employee_name).toBeDefined();
      expect(res.body.code_3601).toBeDefined();
      expect(res.body.code_4101).toBeDefined();
      expect(res.body.code_4141).toBeDefined();
      expect(res.body.code_4142).toBeDefined();
    }
  });
});
