/**
 * src/middleware/tierGuard.js
 * Enforces plan limits — plug into any route that needs gating
 */

const db = require("../db");

// Feature → plan mapping
const FEATURE_PLANS = {
  reports_basic: ["starter", "professional", "enterprise"],
  reports_all: ["professional", "enterprise"],
  shifts: ["professional", "enterprise"],
  sars: ["professional", "enterprise"],
  accounting: ["professional", "enterprise"],
  analytics: ["enterprise"],
  bulk_import: ["enterprise"],
  multi_property: ["enterprise"],
  api_access: ["enterprise"],
};

/**
 * requireFeature('shifts') — middleware that blocks if plan doesn't include feature
 */
exports.requireFeature = (feature) => async (req, res, next) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return res.status(401).json({ error: "Unauthorized" });

    const result = await db.query(
      `SELECT plan_name, subscription_status, trial_ends_at FROM companies WHERE id = $1`,
      [companyId]
    );

    const company = result.rows[0];
    if (!company) return res.status(404).json({ error: "Company not found" });

    // Check subscription active
    if (company.subscription_status === "suspended") {
      return res.status(403).json({
        error:
          "Your subscription is suspended. Please contact MaeRoll support.",
        code: "SUSPENDED",
      });
    }

    // Check trial expired
    if (company.subscription_status === "trial") {
      const trialEnd = new Date(company.trial_ends_at);
      if (trialEnd < new Date()) {
        return res.status(403).json({
          error:
            "Your 30-day trial has expired. Please contact MaeRoll to activate your subscription.",
          code: "TRIAL_EXPIRED",
        });
      }
    }

    // Check feature access
    const allowedPlans = FEATURE_PLANS[feature];
    if (allowedPlans && !allowedPlans.includes(company.plan_name)) {
      return res.status(403).json({
        error: `This feature is not available on your current plan (${company.plan_name}).`,
        code: "PLAN_LIMIT",
        feature,
        requiredPlan: allowedPlans[0],
        upgrade: true,
      });
    }

    next();
  } catch (err) {
    console.error("tierGuard error:", err);
    return res.status(500).json({ error: "Authorization check failed" });
  }
};

/**
 * checkEmployeeLimit — call before adding a new employee
 */
exports.checkEmployeeLimit = async (req, res, next) => {
  try {
    const companyId = req.user?.company_id;

    const result = await db.query(
      `SELECT c.max_employees, c.plan_name,
              COUNT(e.id) AS current_count
       FROM companies c
       LEFT JOIN employees e ON e.company_id = c.id AND e.is_active = true AND e.deleted_at IS NULL
       WHERE c.id = $1
       GROUP BY c.max_employees, c.plan_name`,
      [companyId]
    );

    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: "Company not found" });

    const current = parseInt(row.current_count);
    const limit = row.max_employees;

    if (current >= limit) {
      return res.status(403).json({
        error: `You've reached your employee limit of ${limit} on the ${row.plan_name} plan. Please upgrade to add more employees.`,
        code: "EMPLOYEE_LIMIT",
        current,
        limit,
        upgrade: true,
      });
    }

    req.employeeCount = { current, limit };
    next();
  } catch (err) {
    console.error("checkEmployeeLimit error:", err);
    return res.status(500).json({ error: "Limit check failed" });
  }
};

/**
 * getPlanInfo — attach plan info to req for use in controllers
 */
exports.attachPlanInfo = async (req, res, next) => {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return next();

    const result = await db.query(
      `SELECT c.plan_name, c.max_employees, c.max_users, c.pepm_rate,
              c.subscription_status, c.trial_ends_at,
              p.features
       FROM companies c
       LEFT JOIN plans p ON p.id = c.plan_id
       WHERE c.id = $1`,
      [companyId]
    );

    req.planInfo = result.rows[0] || null;
    next();
  } catch (err) {
    next(); // non-blocking
  }
};
