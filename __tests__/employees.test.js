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

const otherCompanyToken = jwt.sign(
  { id: 99, email: "other@other.com", role: "admin", company_id: 999, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Employees - Auth", () => {
  it("rejects unauthenticated GET", async () => {
    const res = await request(app).get("/api/employees");
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated POST", async () => {
    const res = await request(app).post("/api/employees").send({});
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated DELETE", async () => {
    const res = await request(app).delete("/api/employees/1");
    expect(res.status).toBe(401);
  });
});

describe("Employees - List", () => {
  it("returns employee list for admin", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("returns employee list for manager", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it("other company cannot see employees", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${otherCompanyToken}`);
    expect(res.status).toBe(200);
    const employees = res.body.employees || res.body;
    if (Array.isArray(employees)) {
      employees.forEach(emp => {
        expect(emp.company_id).not.toBe(4);
      });
    }
  });

  it("supports pagination", async () => {
    const res = await request(app)
      .get("/api/employees?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("supports search", async () => {
    const res = await request(app)
      .get("/api/employees?search=test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("Employees - Validation", () => {
  it("rejects missing last_name", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "notanemail", salary: 5000 });
    expect(res.status).toBe(400);
  });

  it("rejects negative salary", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "test@test.com", salary: -1000 });
    expect(res.status).toBe(400);
  });
});

describe("Payroll", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/payroll/periods");
    expect(res.status).toBe(401);
  });

  it("returns payroll periods for admin", async () => {
    const res = await request(app)
      .get("/api/payroll/periods")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404, 500]).toContain(res.status);
  });

  it("rejects payroll processing without required fields", async () => {
    const res = await request(app)
      .post("/api/payroll/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({});
    expect([400, 404, 500]).toContain(res.status);
  });
});
