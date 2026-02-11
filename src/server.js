// src/server.js
const express = require("express");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");



const {
  apiLimiter,
  authLimiter,
  loginLimiter, // (optional) use inside auth routes if you want
} = require("./security/rateLimiters");

// Load .env only when running locally (NOT on Render/production)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const db = require("./db");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const employeesRoutes = require("./routes/employees.routes");
const reportsRoutes = require("./routes/reports.routes");
const { requireAuth } = require("./middleware");
const errorHandler = require("./errorHandler");

const app = express();

// ----- Global middleware -----
app.use(express.json());
app.use(helmet());
app.use(apiLimiter);
app.get("/version", (req, res) => {
  res.json({
    running: "src/server.js",
    commitHint: "add-version-route",
    time: new Date().toISOString(),
  });
});


// ----- Public routes -----
app.get("/", (req, res) => res.send("My first API is running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Swagger UI (public)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// If you prefer /docs instead, change /api-docs to /docs

// ----- Authenticated routes -----
app.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "database error" });
  }
});

// ----- Feature routes -----
// Apply auth rate limiter ONLY once (remove duplicate mounting)
app.use("/auth", authLimiter, authRoutes);
// Users / Employees / Reports have their own auth+role checks inside routes
app.use("/users", usersRoutes);
app.use("/employees", employeesRoutes);
app.use("/reports", reportsRoutes);

// ----- Error handler LAST -----
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
