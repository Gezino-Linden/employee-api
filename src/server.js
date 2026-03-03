// ═══════════════════════════════════════════════════════════════
// STEP 1: ENVIRONMENT & VALIDATION (MUST BE FIRST)
// ═══════════════════════════════════════════════════════════════

// Load .env first
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// Validate environment variables BEFORE starting server
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

// Security middleware
const { apiLimiter, authLimiter } = require("./security/rateLimiters");

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

const db = require("./db");
const { requireAuth } = require("./middleware");
const errorHandler = require("./errorHandler");

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
  // "https://your-frontend.vercel.app",
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

// Body parsing
app.use(express.json({ limit: "1mb" }));

// Helmet security headers
app.use(helmet());

// Rate limiting - Apply to all API routes
app.use("/api/", apiLimiter);

// OPTIONS preflight
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// STEP 6: HEALTH & INFO ENDPOINTS (No auth required)
// ═══════════════════════════════════════════════════════════════

app.get("/", (req, res) => res.send("Employee API running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/version", (req, res) => {
  res.json({
    version: process.env.RENDER_GIT_COMMIT || "local",
    nodeEnv: process.env.NODE_ENV || "development",
  });
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
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
});

// ═══════════════════════════════════════════════════════════════
// STEP 8: ROUTES
// ═══════════════════════════════════════════════════════════════

// Auth routes with STRICT rate limiting
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);

// Other API routes (general rate limiting already applied)
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

// ═══════════════════════════════════════════════════════════════
// STEP 9: ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

// 404 handler
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Global error handler (MUST BE LAST)
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════
// STEP 10: START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
