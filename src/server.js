const express = require("express");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");

const swaggerSpec = require("./swagger");
const errorHandler = require("./errorHandler");
const db = require("./db");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const employeesRoutes = require("./routes/employees.routes");
const reportsRoutes = require("./routes/reports.routes");
const { requireAuth } = require("./middleware");

const {
  apiLimiter,
  authLimiter,
  loginLimiter, // only use if you mount it on /auth/login specifically
} = require("./security/rateLimiters");

// Load .env only when running locally (NOT on Render/production)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();

// Trust proxy is important behind Render (rate limiting + correct IP)
app.set("trust proxy", 1);

app.use(express.json());
app.use(helmet());
app.use(apiLimiter);

// Public endpoints
app.get("/", (req, res) => res.send("My first API is running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Helps confirm Render is running latest commit
app.get("/version", (req, res) => {
  res.json({
    version: process.env.RENDER_GIT_COMMIT || "local",
    nodeEnv: process.env.NODE_ENV || "unknown",
  });
});

// Swagger (public)
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Auth routes (apply limiter ONCE)
app.use("/auth", authLimiter, authRoutes);

// Other routes
app.use("/users", usersRoutes);
app.use("/employees", employeesRoutes);
app.use("/reports", reportsRoutes);

// Protected route: return the currently logged-in user
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

// Error handler LAST
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
