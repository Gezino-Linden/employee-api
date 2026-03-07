// ═══════════════════════════════════════════════════════════════
// STEP 1: ENVIRONMENT & VALIDATION (MUST BE FIRST)
// ═══════════════════════════════════════════════════════════════

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const validateEnv = require("./config/validateEnv");
validateEnv();

// ═══════════════════════════════════════════════════════════════
// STEP 2: IMPORTS
// ═══════════════════════════════════════════════════════════════

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");

const logger = require("./utils/logger");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const { apiLimiter, authLimiter } = require("./middleware/rateLimiter");
const cache = require("./utils/cache");
const db = require("./db");
const { requireAuth } = require("./middleware");

// Routes
const companiesRoutes = require("./routes/companies.routes");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const employeesRoutes = require("./routes/employees.routes");
const reportsRoutes = require("./routes/reports.routes");
const leaveRoutes = require("./routes/leave.routes");
const payrollRoutes = require("./routes/payroll.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const emp201Routes = require("./routes/emp201.routes");
const ui19Routes = require("./routes/ui19.routes");
const irp5Routes = require("./routes/irp5.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const accountingRoutes = require("./routes/accounting.routes");
const shiftsRoutes = require("./routes/shifts.routes");
const invoicesRoutes = require("./routes/invoices.routes");
const apRoutes = require("./routes/ap.routes");
const revenueRoutes = require("./routes/revenue.routes");
const auditRoutes = require("./routes/audit.routes");
const employeeAuthRoutes = require("./routes/employee-auth.routes");
const employeePortalRoutes = require("./routes/employee-portal.routes");

// ═══════════════════════════════════════════════════════════════
// STEP 3: EXPRESS APP SETUP
// ═══════════════════════════════════════════════════════════════

const app = express();
app.set("trust proxy", 1);

// ═══════════════════════════════════════════════════════════════
// STEP 4: CORS CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const allowedOrigins = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "https://gentle-kulfi-c11ec3.netlify.app",
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// ═══════════════════════════════════════════════════════════════
// STEP 5: SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

app.use(express.json({ limit: "1mb" }));
app.use(helmet());
app.use("/api/", apiLimiter);

app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ═══════════════════════════════════════════════════════════════
// STEP 6: HEALTH & INFO ENDPOINTS (No auth required)
// ═══════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.send("Employee API running 🚀"));

app.get("/health", async (req, res) => {
  try {
    const dbHealth = await db.checkHealth();

    const healthStatus = {
      status: dbHealth.healthy ? "healthy" : "unhealthy",
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: "MB",
      },
      cache: {
        entries: cache.size(),
      },
      database: {
        status: dbHealth.healthy ? "connected" : "disconnected",
        responseTime: dbHealth.responseTime,
        connections: {
          total: dbHealth.totalConnections,
          idle: dbHealth.idleConnections,
          waiting: dbHealth.waitingRequests,
        },
      },
    };

    const statusCode = dbHealth.healthy ? 200 : 503;
    return res.status(statusCode).json(healthStatus);
  } catch (err) {
    logger.error("Health check failed", { error: err.message });
    return res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// Swagger docs
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ═══════════════════════════════════════════════════════════════
// STEP 7: AUTHENTICATED ENDPOINTS
// ═══════════════════════════════════════════════════════════════

app.get("/api/me", requireAuth, async (req, res) => {
  try {
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
    logger.error("Error fetching user profile", {
      error: err.message,
      userId: req.user.id,
    });
    return res.status(500).json({ error: "database error" });
  }
});

// ═══════════════════════════════════════════════════════════════
// STEP 8: ROUTES
// ═══════════════════════════════════════════════════════════════

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);

app.use("/api/users", usersRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/companies", companiesRoutes);
app.use("/api/leave", leaveRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/emp201", emp201Routes);
app.use("/api/ui19", ui19Routes);
app.use("/api/irp5", irp5Routes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/accounting", accountingRoutes);
app.use("/api/shifts", shiftsRoutes);
app.use("/api/invoices", invoicesRoutes);
app.use("/api/ap", apRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/employee-auth", employeeAuthRoutes);
app.use("/api/employee-portal", employeePortalRoutes);

// ═══════════════════════════════════════════════════════════════
// STEP 9: ERROR HANDLING (MUST BE AFTER ALL ROUTES)
// ═══════════════════════════════════════════════════════════════

app.use(notFoundHandler);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════
// STEP 10: START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`🗄️  Database: Connected`);
  logger.info(`🔒 Security: Rate limiting enabled`);
  logger.info(`📝 API Docs: http://localhost:${PORT}/api-docs`);
});
