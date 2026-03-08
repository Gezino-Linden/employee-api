// src/controllers/license.controller.js
const db = require("../db");
const {
  TIER_TO_PLAN,
  PLAN_RANK,
  FEATURE_MIN_PLAN,
} = require("../middleware/license");

// GET /api/license/me
exports.getMyLicense = async (req, res) => {
  try {
    const companyId = req.user?.company_id;

    const result = await db.query(
      `SELECT
         c.id, c.name, c.plan_name, c.plan_tier, c.license_key,
         c.subscription_status,
         p.display_name, p.max_employees, p.pepm_rate, p.features,
         lk.expires_at, lk.issued_at, lk.is_active AS license_active,
         lk.hotel_name, lk.contact_email
       FROM companies c
       LEFT JOIN plans p ON p.name = c.plan_name
       LEFT JOIN license_keys lk ON lk.key = c.license_key
       WHERE c.id = $1`,
      [companyId]
    );

    if (!result.rows.length)
      return res.status(404).json({ error: "Company not found" });

    const row = result.rows[0];
    const planTier =
      row.plan_tier || TIER_TO_PLAN[row.plan_name] || "operations";
    const planRank = PLAN_RANK[planTier] || 1;
    const features = Array.isArray(row.features) ? row.features : [];

    // Build boolean feature map for frontend
    const featureMap = {};
    for (const [feat, minPlan] of Object.entries(FEATURE_MIN_PLAN)) {
      featureMap[feat] =
        features.includes(feat) || (PLAN_RANK[minPlan] || 1) <= planRank;
    }

    // Employee usage
    const empResult = await db.query(
      `SELECT COUNT(*) FROM employees WHERE company_id = $1 AND employment_status = 'active'`,
      [companyId]
    );
    const activeEmployees = parseInt(empResult.rows[0].count);

    return res.json({
      plan_name: row.plan_name,
      plan_tier: planTier,
      display_name: row.display_name,
      license_key: row.license_key,
      issued_at: row.issued_at,
      expires_at: row.expires_at,
      license_active: row.license_active,
      subscription_status: row.subscription_status,
      max_employees: row.max_employees || 50,
      active_employees: activeEmployees,
      pepm_rate: row.pepm_rate,
      features,
      feature_map: featureMap,
    });
  } catch (err) {
    console.error("getMyLicense error:", err);
    return res
      .status(500)
      .json({ error: "Failed to fetch license", details: err.message });
  }
};

// POST /api/license/activate
// Body: { license_key }
// Hotel admin enters key they received — links it to their company
exports.activateLicense = async (req, res) => {
  try {
    const companyId = req.user?.company_id;
    const { license_key } = req.body;

    if (!license_key)
      return res.status(400).json({ error: "license_key is required" });

    // Find the key
    const keyResult = await db.query(
      `SELECT lk.*, p.name AS plan_name, p.display_name, p.max_employees, p.features
       FROM license_keys lk
       JOIN plans p ON p.id = lk.plan_id
       WHERE lk.key = $1`,
      [license_key]
    );

    if (!keyResult.rows.length) {
      return res
        .status(404)
        .json({
          error: "License key not found. Check your key and try again.",
        });
    }

    const lk = keyResult.rows[0];

    if (!lk.is_active) {
      return res
        .status(400)
        .json({ error: "This license key has been deactivated." });
    }

    if (lk.expires_at && new Date(lk.expires_at) < new Date()) {
      return res.status(400).json({ error: "This license key has expired." });
    }

    if (lk.used_by_company && lk.used_by_company !== companyId) {
      return res
        .status(400)
        .json({
          error: "This license key is already in use by another company.",
        });
    }

    const planTier = TIER_TO_PLAN[lk.plan_name] || "operations";

    // Activate: update company + mark key as used
    await db.query(
      `UPDATE companies
       SET license_key = $1, plan_name = $2, plan_tier = $3,
           subscription_status = 'active'
       WHERE id = $4`,
      [license_key, lk.plan_name, planTier, companyId]
    );

    await db.query(
      `UPDATE license_keys
       SET used_by_company = $1, used_at = NOW()
       WHERE key = $2`,
      [companyId, license_key]
    );

    return res.json({
      success: true,
      plan_name: lk.plan_name,
      plan_tier: planTier,
      display_name: lk.display_name,
      expires_at: lk.expires_at,
      message: `✅ License activated — ${lk.display_name} plan unlocked!`,
    });
  } catch (err) {
    console.error("activateLicense error:", err);
    return res
      .status(500)
      .json({ error: "Failed to activate license", details: err.message });
  }
};

// GET /api/license/plans  (public — for pricing page)
exports.getPlans = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT name, display_name, max_employees, pepm_rate, features
       FROM plans ORDER BY id`
    );
    return res.json({ plans: result.rows });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch plans" });
  }
};
