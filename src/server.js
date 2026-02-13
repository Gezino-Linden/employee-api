const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const companiesRoutes = require("./routes/companies.routes");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const employeesRoutes = require("./routes/employees.routes");
const reportsRoutes = require("./routes/reports.routes");

const db = require("./db");
const { requireAuth } = require("./middleware");
const errorHandler = require("./errorHandler");

const { apiLimiter, authLimiter } = require("./security/rateLimiters");

// Load .env only locally
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();

/**
 * ✅ IMPORTANT for Render / proxies:
 */
app.set("trust proxy", 1);

/**
 * ✅ CORS (fixes Angular localhost)
 */
const allowedOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  // add your deployed frontend later if needed
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow Postman/curl
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// ✅ MUST be before rate limiters/routes
app.use(cors(corsOptions));

/**
 * ✅ Middleware
 */
app.use(express.json({ limit: "1mb" }));
app.use(helmet());

/**
 * ✅ IMPORTANT:
 * Your rate limiter might block OPTIONS preflight.
 * So we skip rate limiting for OPTIONS requests.
 */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

// ✅ Apply global limiter AFTER we handled OPTIONS
app.use(apiLimiter);

/**
 * ✅ Basic endpoints
 */
app.get("/", (req, res) => res.send("Employee API running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/version", (req, res) => {
  res.json({
    version: process.env.RENDER_GIT_COMMIT || "local",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

/**
 * ✅ Swagger
 */
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * ✅ Routes
 */
app.use("/auth", authLimiter, authRoutes);
app.use("/users", usersRoutes);
app.use("/employees", employeesRoutes);
app.use("/reports", reportsRoutes);
app.use("/companies", companiesRoutes);

/**
 * ✅ /me (protected)
 */
app.get("/me", requireAuth, async (req, res) => {
  try {
    // 🚫 Disable caching for authenticated route
    res.set("Cache-Control", "no-store");

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


// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error handler LAST
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
