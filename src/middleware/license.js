// src/middleware/license.js
// Reads from your existing: plans, license_keys, companies tables

const db = require("../db");

// ── TIER → PLAN MAPPING ───────────────────────────────────────
const TIER_TO_PLAN = {
  tier1: "operations",
  tier2: "operations",
  tier3: "intelligence",
  tier4: "intelligence",
  tier5: "intelligence",
  tier6: "performance",
  tier7: "enterprise",
};

const PLAN_RANK = {
  operations: 1,
  intelligence: 2,
  performance: 3,
  enterprise: 4,
};

// ── FEATURE → MINIMUM PLAN ────────────────────────────────────
const FEATURE_MIN_PLAN = {
  // Operations (all plans)
  payroll: "operations",
  leave: "operations",
  attendance: "operations",
  hr: "operations",
  shifts: "operations",
  sars: "operations",
  basic_accounting: "operations",
  standard_reports: "operations",
  reports_basic: "operations",

  // Intelligence+
  reports_all: "intelligence",
  department_analytics: "intelligence",
  labour_dashboards: "intelligence",
  ap_ageing: "intelligence",
  ar_ageing: "intelligence",
  cash_flow: "intelligence",
  collection_alerts: "intelligence",
  advanced_reporting: "intelligence",

  // Performance+
  multi_property: "performance",
  forecasting: "performance",
  budget_tracking: "performance",
  custom_dashboards: "performance",
  api_access: "performance",
  priority_support: "performance",

  // Enterprise
  dedicated_infra: "enterprise",
  custom_integrations: "enterprise",
  sla_support: "enterprise",
  onboarding_team: "enterprise",
};

// ── ATTACH PLAN TO REQUEST ────────────────────────────────────
// Joins companies → plans → license_keys to get full picture
async function attachPlan(req, res, next) {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return next();

    const result = await db.query(
      `SELECT
         c.id,
         c.name,
         c.plan_name,
         c.plan_tier,
         c.license_key,
         c.subscription_status,
         p.features,
         p.max_employees,
         p.display_name,
         p.pepm_rate,
         lk.expires_at,
         lk.is_active AS license_active
       FROM companies c
       LEFT JOIN plans p ON p.name = c.plan_name
       LEFT JOIN license_keys lk ON lk.key = c.license_key
       WHERE c.id = $1`,
      [companyId]
    );

    if (!result.rows.length) return next();

    const row = result.rows[0];

    // Check suspension
    if (row.subscription_status === "suspended") {
      return res.status(403).json({
        error: "Account suspended. Please contact support.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    // Check license expiry
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return res.status(403).json({
        error: "Your license has expired. Please renew to continue.",
        code: "LICENSE_EXPIRED",
        expired_at: row.expires_at,
      });
    }

    // Resolve plan tier (use plan_tier column, fall back to deriving from plan_name)
    const planTier =
      row.plan_tier || TIER_TO_PLAN[row.plan_name] || "operations";
    const features = Array.isArray(row.features) ? row.features : [];

    req.company = {
      id: row.id,
      name: row.name,
      plan_name: row.plan_name,
      plan_tier: planTier,
      plan_rank: PLAN_RANK[planTier] || 1,
      display_name: row.display_name,
      features,
      max_employees: row.max_employees || 50,
      license_key: row.license_key,
      license_active: row.license_active,
      expires_at: row.expires_at,
    };

    next();
  } catch (err) {
    console.error("attachPlan error:", err);
    next(); // never block on licensing errors
  }
}

// ── REQUIRE MINIMUM PLAN ──────────────────────────────────────
function requirePlan(minimumPlan) {
  return async (req, res, next) => {
    await attachPlan(req, res, () => {
      const rank = req.company?.plan_rank || 1;
      const minRank = PLAN_RANK[minimumPlan] || 1;

      if (rank < minRank) {
        return res.status(403).json({
          error: `This feature requires the ${minimumPlan} plan or higher`,
          code: "PLAN_UPGRADE_REQUIRED",
          current_plan: req.company?.plan_tier || "operations",
          required_plan: minimumPlan,
        });
      }
      next();
    });
  };
}

// ── REQUIRE SPECIFIC FEATURE ──────────────────────────────────
function requireFeature(feature) {
  return async (req, res, next) => {
    await attachPlan(req, res, () => {
      const hasFeature = req.company?.features?.includes(feature);
      if (!hasFeature) {
        const minPlan = FEATURE_MIN_PLAN[feature] || "intelligence";
        return res.status(403).json({
          error: `Feature "${feature}" is not available on your current plan`,
          code: "FEATURE_NOT_AVAILABLE",
          feature,
          current_plan: req.company?.plan_tier || "operations",
          required_plan: minPlan,
        });
      }
      next();
    });
  };
}

module.exports = {
  attachPlan,
  requirePlan,
  requireFeature,
  TIER_TO_PLAN,
  PLAN_RANK,
  FEATURE_MIN_PLAN,
};
