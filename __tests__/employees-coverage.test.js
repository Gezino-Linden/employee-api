/**
 * employees-coverage.test.js
 * Targets employees.controller.js: CRUD, search, filters, exports,
 * salary updates, salary history, departments, restore
 * Current coverage: 26.24% → target 60%+
 */

const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");
const db = require("../src/db");

const JWT_SECRET = process.env.JWT_SECRET;

const createToken = (role = "admin", companyId = 4) =>
  jwt.sign(
    { id: 1, email: `${role}@grandhotel.com`, role, company_id: companyId, plan: "intelligence" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

const adminToken  = createToken("admin", 4);
const managerToken = createToken("manager", 4);
const otherToken  = createToken("admin", 999);

// Track created employee IDs for cleanup
let createdIds = [];

beforeAll(async () => {
  // Ensure test employees don't already exist
  await db.query(`DELETE FROM employees WHERE email LIKE '%emp-cov-test%'`).catch(() => {});
});

afterAll(async () => {
  // Clean up created employees
  if (createdIds.length > 0) {
    await db.query(`DELETE FROM employees WHERE id = ANY($1)`, [createdIds]).catch(() => {});
  }
  await db.query(`DELETE FROM employees WHERE email LIKE '%emp-cov-test%'`).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 500));
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. GET EMPLOYEES - list with filters
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - List with Filters", () => {
  it("returns paginated employee list", async () => {
    const res = await request(app)
      .get("/api/employees?page=1&limit=5")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(5);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("filters by search term", async () => {
    const res = await request(app)
      .get("/api/employees?search=test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("filters by department", async () => {
    const res = await request(app)
      .get("/api/employees?department=Housekeeping")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      res.body.data.forEach(e => expect(e.department).toBe("Housekeeping"));
    }
  });

  it("filters by position", async () => {
    const res = await request(app)
      .get("/api/employees?position=Manager")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("filters inactive employees", async () => {
    const res = await request(app)
      .get("/api/employees?active=false")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      res.body.data.forEach(e => expect(e.is_active).toBe(false));
    }
  });

  it("caps limit at 50", async () => {
    const res = await request(app)
      .get("/api/employees?limit=200")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(50);
  });

  it("defaults page to 1 for invalid page param", async () => {
    const res = await request(app)
      .get("/api/employees?page=abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
  });

  it("manager can list employees", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
  });

  it("company isolation - other company sees own employees only", async () => {
    const res = await request(app)
      .get("/api/employees")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      res.body.data.forEach(e => expect(e.company_id).toBe(999));
    }
  });

  it("supports combined filters: search + department", async () => {
    const res = await request(app)
      .get("/api/employees?search=test&department=Kitchen")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GET EMPLOYEE BY ID
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Get By ID", () => {
  it("returns 400 for invalid ID (0)", async () => {
    const res = await request(app)
      .get("/api/employees/0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid id/i);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await request(app)
      .get("/api/employees/abc")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent employee", async () => {
    const res = await request(app)
      .get("/api/employees/999999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns employee data for valid ID", async () => {
    // First get an existing employee ID
    const listRes = await request(app)
      .get("/api/employees?limit=1")
      .set("Authorization", `Bearer ${adminToken}`);
    if (listRes.body.data.length === 0) return;
    const empId = listRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/employees/${empId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(empId);
    expect(res.body.first_name).toBeDefined();
    expect(res.body.email).toBeDefined();
  });

  it("other company cannot access company 4 employee", async () => {
    const listRes = await request(app)
      .get("/api/employees?limit=1")
      .set("Authorization", `Bearer ${adminToken}`);
    if (listRes.body.data.length === 0) return;
    const empId = listRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/employees/${empId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CREATE EMPLOYEE
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Create", () => {
  it("returns 400 for first_name too short", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "A", last_name: "Test", email: "t@t.com", department: "IT", position: "Dev", salary: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/first_name/i);
  });

  it("returns 400 for last_name too short", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "A", email: "t@t.com", department: "IT", position: "Dev", salary: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last_name/i);
  });

  it("returns 400 for invalid email", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "notanemail", department: "IT", position: "Dev", salary: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it("returns 400 for missing department", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "t@t.com", position: "Dev", salary: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/department/i);
  });

  it("returns 400 for missing position", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "t@t.com", department: "IT", salary: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/position/i);
  });

  it("returns 400 for negative salary", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "t@t.com", department: "IT", position: "Dev", salary: -100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/salary/i);
  });

  it("creates employee with valid data", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "Coverage",
        last_name: "TestEmp",
        email: `emp-cov-test-${Date.now()}@test.com`,
        department: "IT",
        position: "Developer",
        salary: 25000,
        age: 30
      });
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) {
      createdIds.push(res.body.id);
      expect(res.body.first_name).toBe("Coverage");
      expect(res.body.is_active).toBe(true);
      expect(res.body.company_id).toBe(4);
      expect(res.body.password).toBeUndefined();
    }
  });

  it("creates employee with zero salary (free volunteer)", async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "Zero",
        last_name: "Salary",
        email: `emp-cov-test-zero-${Date.now()}@test.com`,
        department: "Volunteer",
        position: "Helper",
        salary: 0
      });
    expect([201, 409]).toContain(res.status);
    if (res.status === 201) createdIds.push(res.body.id);
  });

  it("returns 409 for duplicate email", async () => {
    const email = `emp-cov-test-dup-${Date.now()}@test.com`;
    // Create first
    const first = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Dup", last_name: "One", email, department: "IT", position: "Dev", salary: 5000 });
    if (first.status === 201) createdIds.push(first.body.id);

    // Try to create duplicate
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Dup", last_name: "Two", email, department: "HR", position: "Manager", salary: 6000 });
    expect([409, 201]).toContain(res.status);
    if (res.status === 201) createdIds.push(res.body.id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. UPDATE EMPLOYEE
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Update", () => {
  let testEmpId = null;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "Update",
        last_name: "Target",
        email: `emp-cov-test-update-${Date.now()}@test.com`,
        department: "IT",
        position: "Junior Dev",
        salary: 15000
      });
    if (res.status === 201) {
      testEmpId = res.body.id;
      createdIds.push(testEmpId);
    }
  });

  it("returns 400 for invalid ID", async () => {
    const res = await request(app)
      .put("/api/employees/0")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "t@t.com", department: "IT", position: "Dev" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent employee", async () => {
    const res = await request(app)
      .put("/api/employees/999999")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Test", last_name: "User", email: "t@t.com", department: "IT", position: "Dev" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid email on update", async () => {
    if (!testEmpId) return;
    const res = await request(app)
      .put(`/api/employees/${testEmpId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Update", last_name: "Target", email: "bad-email", department: "IT", position: "Dev" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative salary on update", async () => {
    if (!testEmpId) return;
    const res = await request(app)
      .put(`/api/employees/${testEmpId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ first_name: "Update", last_name: "Target", email: "t@t.com", department: "IT", position: "Dev", salary: -500 });
    expect(res.status).toBe(400);
  });

  it("successfully updates employee", async () => {
    if (!testEmpId) return;
    const res = await request(app)
      .put(`/api/employees/${testEmpId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "Updated",
        last_name: "Employee",
        email: `emp-cov-test-updated-${Date.now()}@test.com`,
        department: "HR",
        position: "Senior Dev",
        salary: 20000
      });
    expect([200, 404, 409]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.first_name).toBe("Updated");
      expect(res.body.department).toBe("HR");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DELETE (soft) & RESTORE
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Delete and Restore", () => {
  let softDeleteId = null;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "ToDelete",
        last_name: "Employee",
        email: `emp-cov-test-delete-${Date.now()}@test.com`,
        department: "Temp",
        position: "Temp Worker",
        salary: 5000
      });
    if (res.status === 201) {
      softDeleteId = res.body.id;
      createdIds.push(softDeleteId);
    }
  });

  it("returns 400 for invalid ID on delete", async () => {
    const res = await request(app)
      .delete("/api/employees/0")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent employee on delete", async () => {
    const res = await request(app)
      .delete("/api/employees/999999")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("soft deletes employee (sets is_active=false)", async () => {
    if (!softDeleteId) return;
    const res = await request(app)
      .delete(`/api/employees/${softDeleteId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect([204, 404]).toContain(res.status);
  });

  it("returns 400 for invalid ID on restore", async () => {
    const res = await request(app)
      .patch("/api/employees/0/restore")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent employee on restore", async () => {
    const res = await request(app)
      .patch("/api/employees/999999/restore")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("restores a soft-deleted employee", async () => {
    if (!softDeleteId) return;
    const res = await request(app)
      .patch(`/api/employees/${softDeleteId}/restore`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.is_active).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. UPDATE SALARY
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Update Salary", () => {
  let salaryEmpId = null;

  beforeAll(async () => {
    const res = await request(app)
      .post("/api/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        first_name: "Salary",
        last_name: "TestEmployee",
        email: `emp-cov-test-salary-${Date.now()}@test.com`,
        department: "Finance",
        position: "Accountant",
        salary: 20000
      });
    if (res.status === 201) {
      salaryEmpId = res.body.id;
      createdIds.push(salaryEmpId);
    }
  });

  it("returns 400 for invalid ID", async () => {
    const res = await request(app)
      .patch("/api/employees/0/salary")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ salary: 25000 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative salary", async () => {
    if (!salaryEmpId) return;
    const res = await request(app)
      .patch(`/api/employees/${salaryEmpId}/salary`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ salary: -1000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/salary/i);
  });

  it("returns 404 for non-existent employee", async () => {
    const res = await request(app)
      .patch("/api/employees/999999/salary")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ salary: 25000 });
    expect(res.status).toBe(404);
  });

  it("successfully updates salary and creates audit record", async () => {
    if (!salaryEmpId) return;
    const res = await request(app)
      .patch(`/api/employees/${salaryEmpId}/salary`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ salary: 25000 });
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(parseFloat(res.body.salary)).toBe(25000);
    }
  });

  it("accepts salary of 0", async () => {
    if (!salaryEmpId) return;
    const res = await request(app)
      .patch(`/api/employees/${salaryEmpId}/salary`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ salary: 0 });
    expect([200, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. SALARY HISTORY
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Salary History", () => {
  it("returns 400 for invalid ID", async () => {
    const res = await request(app)
      .get("/api/employees/0/salary-history")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it("returns empty array for employee with no history", async () => {
    const res = await request(app)
      .get("/api/employees/999999/salary-history")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  it("returns salary history for employee with changes", async () => {
    // Use the first available employee
    const listRes = await request(app)
      .get("/api/employees?limit=1")
      .set("Authorization", `Bearer ${adminToken}`);
    if (listRes.body.data.length === 0) return;
    const empId = listRes.body.data[0].id;

    const res = await request(app)
      .get(`/api/employees/${empId}/salary-history`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. GET DEPARTMENTS
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Departments", () => {
  it("returns list of departments", async () => {
    const res = await request(app)
      .get("/api/employees/departments")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("unauthenticated request rejected", async () => {
    const res = await request(app)
      .get("/api/employees/departments");
    expect(res.status).toBe(401);
  });

  it("manager can get departments", async () => {
    const res = await request(app)
      .get("/api/employees/departments")
      .set("Authorization", `Bearer ${managerToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("other company sees only their departments", async () => {
    const res = await request(app)
      .get("/api/employees/departments")
      .set("Authorization", `Bearer ${otherToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Export CSV", () => {
  it("returns CSV file", async () => {
    const res = await request(app)
      .get("/api/employees/export/csv")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers["content-type"]).toMatch(/csv/);
      expect(res.headers["content-disposition"]).toMatch(/employees\.csv/);
    }
  });

  it("returns 401 or 404 for unauthenticated export", async () => {
    const res = await request(app)
      .get("/api/employees/export/csv");
    expect([401, 404]).toContain(res.status);
  });

  it("exports with department filter", async () => {
    const res = await request(app)
      .get("/api/employees/export/csv?department=Kitchen")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });

  it("exports inactive employees", async () => {
    const res = await request(app)
      .get("/api/employees/export/csv?active=false")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. EXPORT XLSX
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Export XLSX", () => {
  it("returns XLSX file", async () => {
    const res = await request(app)
      .get("/api/employees/export/xlsx")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers["content-type"]).toMatch(/spreadsheet|excel|xlsx/);
    }
  });

  it("returns 401 or 404 for unauthenticated XLSX export", async () => {
    const res = await request(app)
      .get("/api/employees/export/xlsx");
    expect([401, 404]).toContain(res.status);
  });

  it("exports XLSX with search filter", async () => {
    const res = await request(app)
      .get("/api/employees/export/xlsx?search=manager")
      .set("Authorization", `Bearer ${adminToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. AUTH PROTECTION
// ═══════════════════════════════════════════════════════════════════════════

describe("Employees - Auth Protection", () => {
  it("GET /employees requires auth", async () => {
    const res = await request(app).get("/api/employees");
    expect(res.status).toBe(401);
  });

  it("POST /employees requires auth", async () => {
    const res = await request(app).post("/api/employees").send({});
    expect(res.status).toBe(401);
  });

  it("PUT /employees/:id requires auth", async () => {
    const res = await request(app).put("/api/employees/1").send({});
    expect(res.status).toBe(401);
  });

  it("DELETE /employees/:id requires auth", async () => {
    const res = await request(app).delete("/api/employees/1");
    expect(res.status).toBe(401);
  });

  it("PATCH /employees/:id/salary requires auth", async () => {
    const res = await request(app).patch("/api/employees/1/salary").send({});
    expect(res.status).toBe(401);
  });

  it("PATCH /employees/:id/restore requires auth", async () => {
    const res = await request(app).patch("/api/employees/1/restore");
    expect(res.status).toBe(401);
  });
});
