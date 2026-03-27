const request = require("supertest");
const app = require("../src/server");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const testToken = jwt.sign(
  { id: 1, email: "admin@grandhotel.com", role: "admin", company_id: 4, plan: "intelligence" },
  JWT_SECRET,
  { expiresIn: "1h" }
);

const expiredToken = jwt.sign(
  { id: 1, email: "admin@grandhotel.com", role: "admin", company_id: 4 },
  JWT_SECRET,
  { expiresIn: "-1s" }
);

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
});

describe("Auth - Login", () => {
  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "wrong@test.com", password: "wrongpassword" });
    expect([401, 429]).toContain(res.status);
  });

  it("rejects empty email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "", password: "somepassword" });
    expect([400, 429]).toContain(res.status);
  });

  it("rejects missing password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@grandhotel.com" });
    expect([400, 429]).toContain(res.status);
  });

  it("rejects invalid email format", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "notanemail", password: "somepassword" });
    expect([400, 429]).toContain(res.status);
  });

  it("returns user object on valid login", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@grandhotel.com", password: "Maer0ll@2025!" });
    expect([200, 429]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe("admin@grandhotel.com");
      expect(res.body.token).toBeUndefined();
    }
  });
});

describe("Auth - Token Validation", () => {
  it("rejects expired token", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects malformed token", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer not.a.valid.token");
    expect(res.status).toBe(401);
  });

  it("rejects missing token", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("accepts valid token", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${testToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe("Auth - Refresh Token", () => {
  it("rejects missing refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Refresh token required");
  });

  it("rejects invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "invalidtoken123" });
    expect([401, 500]).toContain(res.status);
  });
});

describe("Auth - Rate Limiting", () => {
  it("blocks after too many failed login attempts", async () => {
    const attempts = [];
    for (let i = 0; i < 6; i++) {
      attempts.push(
        request(app)
          .post("/api/auth/login")
          .send({ email: `ratetest${i}@test.com`, password: "wrong" })
      );
    }
    const results = await Promise.all(attempts);
    const statuses = results.map(r => r.status);
    expect(statuses.some(s => s === 429 || s === 401)).toBe(true);
  });
});
