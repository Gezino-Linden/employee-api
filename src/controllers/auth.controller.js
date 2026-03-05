// src/controllers/auth.controller.js — Full version with license key validation
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "8h";

// ── Validators ─────────────────────────────────────────────────────────────
function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("one uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("one number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    errors.push("one special character");
  return errors;
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function slugifyCompany(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// ── REGISTER (with license key) ────────────────────────────────────────────
exports.register = async (req, res) => {
  const { name, email, password, companyName, licenseKey } = req.body;

  // Basic validation
  if (!name || name.trim().length < 2)
    return res
      .status(400)
      .json({ error: "Name must be at least 2 characters" });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: "Valid email address required" });
  if (!companyName || companyName.trim().length < 2)
    return res.status(400).json({ error: "Hotel/company name is required" });
  if (!licenseKey || licenseKey.trim().length < 10)
    return res
      .status(400)
      .json({ error: "License key is required. Contact MaeRoll to get one." });

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0)
    return res
      .status(400)
      .json({ error: `Password must contain: ${pwErrors.join(", ")}` });

  try {
    // ── Validate license key ──────────────────────────────────────────────
    const keyRes = await db.query(
      `SELECT lk.id, lk.key, lk.used_at, lk.expires_at, lk.is_active,
              p.id AS plan_id, p.name AS plan_name, p.display_name,
              p.max_employees, p.max_users, p.pepm_rate
       FROM license_keys lk
       JOIN plans p ON p.id = lk.plan_id
       WHERE lk.key = $1`,
      [licenseKey.trim().toUpperCase()]
    );

    if (!keyRes.rows.length)
      return res
        .status(400)
        .json({ error: "Invalid license key. Please check and try again." });

    const lic = keyRes.rows[0];

    if (!lic.is_active)
      return res
        .status(400)
        .json({
          error: "This license key has been deactivated. Contact MaeRoll.",
        });

    if (lic.used_at)
      return res
        .status(400)
        .json({ error: "This license key has already been used." });

    if (lic.expires_at && new Date(lic.expires_at) < new Date())
      return res
        .status(400)
        .json({
          error: "This license key has expired. Contact MaeRoll for a new one.",
        });

    // ── Check email not already registered ────────────────────────────────
    const exists = await db.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (exists.rows.length)
      return res
        .status(409)
        .json({ error: "An account with this email already exists." });

    const hashed = await bcrypt.hash(password, 12);
    const slug = slugifyCompany(companyName.trim());

    await db.query("BEGIN");

    // Create company with plan info
    let companyRes = await db
      .query(
        `INSERT INTO companies
         (name, slug, plan_id, plan_name, max_employees, max_users, pepm_rate, license_key, subscription_status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW() + INTERVAL '365 days')
       RETURNING id, name, slug`,
        [
          companyName.trim(),
          slug,
          lic.plan_id,
          lic.plan_name,
          lic.max_employees,
          lic.max_users,
          lic.pepm_rate,
          lic.key,
        ]
      )
      .catch(async () => {
        const fallback = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
        return db.query(
          `INSERT INTO companies
           (name, slug, plan_id, plan_name, max_employees, max_users, pepm_rate, license_key, subscription_status, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW() + INTERVAL '365 days')
         RETURNING id, name, slug`,
          [
            companyName.trim(),
            fallback,
            lic.plan_id,
            lic.plan_name,
            lic.max_employees,
            lic.max_users,
            lic.pepm_rate,
            lic.key,
          ]
        );
      });

    const company = companyRes.rows[0];

    // Create admin user
    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, name, email, role, company_id`,
      [name.trim(), email.trim().toLowerCase(), hashed, company.id]
    );

    // Mark license key as used
    await db.query(
      `UPDATE license_keys SET used_at = NOW(), used_by_company = $1 WHERE id = $2`,
      [company.id, lic.id]
    );

    await db.query("COMMIT");

    return res.status(201).json({
      message: `Welcome to MaeRoll! Your ${lic.display_name} account has been created.`,
      user: userRes.rows[0],
      plan: lic.plan_name,
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Register error:", err);
    return res
      .status(500)
      .json({ error: "Registration failed. Please try again." });
  }
};

// ── LOGIN ──────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const { email, password } = req.body;

  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Valid email required" });
  if (!password) return res.status(400).json({ error: "Password required" });

  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.password, u.role, u.company_id,
              c.plan_name, c.max_employees, c.subscription_status, c.trial_ends_at
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    const dummyHash = "$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxx";
    const valid = user?.password
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        plan: user.plan_name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        plan: user.plan_name,
      },
      expiresIn: JWT_EXPIRY,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// ── ACCEPT INVITE ──────────────────────────────────────────────────────────
exports.acceptInvite = async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || token.length < 20)
    return res.status(400).json({ error: "Valid invite token required" });
  if (!name || name.trim().length < 2)
    return res
      .status(400)
      .json({ error: "Name must be at least 2 characters" });

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0)
    return res
      .status(400)
      .json({ error: `Password must contain: ${pwErrors.join(", ")}` });

  const tokenHash = sha256(token);

  try {
    await db.query("BEGIN");
    const inviteRes = await db.query(
      `SELECT id, company_id, email, role, expires_at, used_at FROM user_invites WHERE token_hash = $1`,
      [tokenHash]
    );
    if (!inviteRes.rows.length) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid invite link" });
    }

    const invite = inviteRes.rows[0];
    if (invite.used_at) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Invite already used" });
    }
    if (new Date(invite.expires_at) < new Date()) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Invite expired" });
    }

    // Check user limit for this company
    const limitRes = await db.query(
      `SELECT c.max_users, COUNT(u.id) AS current_users
       FROM companies c LEFT JOIN users u ON u.company_id = c.id
       WHERE c.id = $1 GROUP BY c.max_users`,
      [invite.company_id]
    );
    const lim = limitRes.rows[0];
    if (lim && parseInt(lim.current_users) >= lim.max_users) {
      await db.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "User limit reached for your plan. Please upgrade." });
    }

    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND company_id = $2`,
      [invite.email, invite.company_id]
    );
    if (existing.rows.length) {
      await db.query("ROLLBACK");
      return res.status(409).json({ error: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 12);
    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, company_id`,
      [name.trim(), invite.email, hashed, invite.role, invite.company_id]
    );
    await db.query(`UPDATE user_invites SET used_at = NOW() WHERE id = $1`, [
      invite.id,
    ]);
    await db.query("COMMIT");
    return res.status(201).json(userRes.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Accept invite error:", err);
    return res.status(500).json({ error: "Failed to accept invite" });
  }
};

// ── LICENSE KEY VALIDATOR (for frontend pre-check) ────────────────────────
exports.validateKey = async (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: "Key required" });

  try {
    const result = await db.query(
      `SELECT lk.key, lk.used_at, lk.expires_at, lk.is_active, lk.hotel_name,
              p.display_name, p.max_employees, p.pepm_rate
       FROM license_keys lk JOIN plans p ON p.id = lk.plan_id
       WHERE lk.key = $1`,
      [key.trim().toUpperCase()]
    );

    if (!result.rows.length)
      return res.status(404).json({ valid: false, error: "Key not found" });
    const k = result.rows[0];
    if (!k.is_active || k.used_at)
      return res
        .status(400)
        .json({ valid: false, error: "Key already used or inactive" });
    if (k.expires_at && new Date(k.expires_at) < new Date())
      return res.status(400).json({ valid: false, error: "Key expired" });

    return res.json({
      valid: true,
      plan: k.display_name,
      maxEmployees: k.max_employees,
      pepmRate: k.pepm_rate,
      hotelName: k.hotel_name,
    });
  } catch (err) {
    return res.status(500).json({ error: "Validation failed" });
  }
};

// ── EXPORT VALIDATORS ──────────────────────────────────────────────────────
exports.validatePassword = validatePassword;
