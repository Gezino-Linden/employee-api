// src/server.js
const express = require("express");

const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./swagger");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const employeesRoutes = require("./routes/employees.routes");
const reportsRoutes = require("./routes/reports.routes");

const db = require("./db");
const { requireAuth } = require("./middleware");
const errorHandler = require("./errorHandler");

// Rate limiters (if you have them)
let apiLimiter = (req, res, next) => next();
let authLimiter = (req, res, next) => next();
let loginLimiter = (req, res, next) => next();

try {
  const r = require("./security/rateLimiters");
  apiLimiter = r.apiLimiter || apiLimiter;
  authLimiter = r.authLimiter || authLimiter;
  loginLimiter = r.loginLimiter || loginLimiter;
} catch (_) {
  // If security/rateLimiters doesn't exist yet, app still runs.
}

// Load .env only for local dev (Render sets env vars in dashboard)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();

// Middlewares
app.set("trust proxy", 1); // required for Render / proxies
app.use(express.json());
app.use(helmet());
app.use(apiLimiter);

// Basic routes
app.get("/", (req, res) => res.send("My first API is running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Optional: verify which build is running (set APP_VERSION in env or keep fallback)
app.get("/version", (req, res) => {
  res.json({
    version: process.env.APP_VERSION || "dev",
    node_env: process.env.NODE_ENV || "development",
  });
});

// ✅ Protected route: return the currently logged-in user (NOW includes company_id)
app.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email, role, company_id FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
});

// Swagger docs (works locally + Render)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes (rate-limit auth endpoints separately)
app.use("/auth/register", authLimiter);
app.use("/auth/login", loginLimiter);
app.use("/auth", authRoutes);

app.use("/users", usersRoutes);
app.use("/employees", employeesRoutes);
app.use("/reports", reportsRoutes);

// Error handler LAST
app.use(errorHandler);

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
