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
const leaveRoutes = require("./routes/leave.routes");
const payrollRoutes = require("./routes/payroll.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const emp201Routes = require("./routes/emp201.routes");
const ui19Routes = require("./routes/ui19.routes");
const irp5Routes = require("./routes/irp5.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const accountingRoutes = require("./routes/accounting.routes");
const shiftsRoutes = require("./routes/shifts.routes");
const invoicesRoutes = require("./routes/invoices.routes"); // ← NEW
const apRoutes = require("./routes/ap.routes"); // ← NEW
const revenueRoutes = require("./routes/revenue.routes"); // ← NEW

const db = require("./db");
const { requireAuth } = require("./middleware");
const errorHandler = require("./errorHandler");

const { apiLimiter, authLimiter } = require("./security/rateLimiters");

// Load .env only locally
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();

app.set("trust proxy", 1);

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
app.use(express.json({ limit: "1mb" }));
app.use(helmet());

app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(apiLimiter);

app.get("/", (req, res) => res.send("Employee API running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/version", (req, res) => {
  res.json({
    version: process.env.RENDER_GIT_COMMIT || "local",
    nodeEnv: process.env.NODE_ENV || "development",
  });
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

// ── ROUTES ──────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRoutes);
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
app.use("/api/invoices", invoicesRoutes); // ← NEW
app.use("/api/ap", apRoutes); // ← NEW
app.use("/api/revenue", revenueRoutes); // ← NEW

// 404
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Error handler LAST
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
