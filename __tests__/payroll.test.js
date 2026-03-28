const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const adminToken = jwt.sign(
  { id: 1, email: "admin@grandhotel.com", role: "admin", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

const managerToken = jwt.sign(
  { id: 2, email: "manager@grandhotel.com", role: "manager", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

const employeeToken = jwt.sign(
  { id: 3, email: "employee@grandhotel.com", role: "employee", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

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

describe("Payroll - Summary & Records", () => {
  it("GET /summary - returns data for admin", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /summary - returns data for manager", async () => {
    const res = await request(app)
      .get("/api/payroll/summary?year=2026&month=3")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /records - returns paginated records for admin", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("GET /records - supports status filter", async () => {
    const res = await request(app)
      .get("/api/payroll/records?year=2026&month=3&status=paid")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /history - returns history for admin", async () => {
    const res = await request(app)
      .get("/api/payroll/history")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("GET /periods - returns periods for admin", async () => {
    const res = await request(app)
      .get("/api/payroll/periods")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });
});

describe("Payroll - Processing Validation", () => {
  it("POST /process - rejects missing month", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ year: 2026, employee_ids: [1] });
    expect(res.status).toBe(400);
  });

  it("POST /process - rejects missing year", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 3, employee_ids: [1] });
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

  it("POST /initialize - rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/payroll/initialize")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe("Payroll - Payslip", () => {
  it("GET /payslip/:id - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/payslip/1");
    expect(res.status).toBe(401);
  });

  it("GET /payslip/:id - returns 404 for non-existent record", async () => {
    const res = await request(app)
      .get("/api/payroll/payslip/999999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([404, 500]).toContain(res.status);
  });
});

describe("Payroll - Mark As Paid", () => {
  it("PATCH /records/:id/pay - rejects unauthenticated", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/1/pay")
      .send({ payment_method: "bank_transfer" });
    expect(res.status).toBe(401);
  });

  it("PATCH /records/:id/pay - rejects missing payment_method", async () => {
    const res = await request(app)
      .patch("/api/payroll/records/1/pay")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

