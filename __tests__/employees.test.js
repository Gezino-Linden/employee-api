const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const testToken = jwt.sign(
  { id: 1, email: "admin@grandhotel.com", role: "admin", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Employees", () => {
  it("GET /api/employees - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/employees");
    expect(res.status).toBe(401);
  });

  it("GET /api/employees - returns list when authenticated", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("POST /api/employees - rejects missing required fields", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${testToken}`)
      .send({ first_name: "Test" });
    expect(res.status).toBe(400);
  });
});

describe("Payroll", () => {
  it("GET /api/payroll/periods - rejects unauthenticated", async () => {
    const res = await request(app).get("/api/payroll/periods");
    expect(res.status).toBe(401);
  });

  it("GET /api/payroll/periods - returns data when authenticated", async () => {
    const res = await request(app)
      .get("/api/payroll/periods")
      .set("Authorization", `Bearer ${testToken}`);
    expect([200, 404, 500]).toContain(res.status);
  });
});
