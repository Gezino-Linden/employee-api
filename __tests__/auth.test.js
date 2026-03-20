const request = require("supertest");
const app = require("../src/server");

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Auth", () => {
  it("POST /api/auth/login - rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "wrong@test.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/auth/login - rejects missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "" });
    expect(res.status).toBe(400);
  });

  it("POST /api/auth/refresh - rejects missing refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Refresh token required");
  });

  it("GET /api/me - rejects unauthenticated request", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });
});
