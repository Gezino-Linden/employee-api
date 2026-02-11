const express = require("express");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const companiesRoutes = require("./routes/companies.routes");


const {
  apiLimiter,
  authLimiter,
  loginLimiter,
} = require("./security/rateLimiters");

// Load .env only locally
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

/**
 * ✅ IMPORTANT for Render / proxies:
 * fixes express-rate-limit X-Forwarded-For errors
 */
app.set("trust proxy", 1);

app.use(express.json());
app.use(helmet());

// Apply global limiter (safe)
app.use(apiLimiter);

app.get("/", (req, res) => res.send("Employee API running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Version endpoint (optional)
app.get("/version", (req, res) => {
  res.json({
    version: process.env.RENDER_GIT_COMMIT || "local",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Auth routes (apply authLimiter/loginLimiter inside auth.routes if you want,
// otherwise wrap here like this)
app.use("/auth", authLimiter, authRoutes);

// Normal routes
app.use("/users", usersRoutes);
app.use("/employees", employeesRoutes);
app.use("/reports", reportsRoutes);
app.use("/companies", companiesRoutes);


// /me includes company_id
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

// Error handler LAST
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
