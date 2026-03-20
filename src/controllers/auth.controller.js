// src/controllers/auth.controller.js â€” Full version with license key + password reset
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "8h";
const REFRESH_EXPIRY_DAYS = 30;
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://gentle-kulfi-c11ec3.netlify.app";

// â”€â”€ Email transporter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD, // Gmail App Password (not your real password)
    },
  });
}

// â”€â”€ Validators â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ REGISTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.register = async (req, res) => {
  const { name, email, password, companyName, licenseKey } = req.body;

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

    let companyRes = await db
      .query(
        `INSERT INTO companies (name, slug, plan_id, plan_name, max_employees, max_users, pepm_rate, license_key, subscription_status, trial_ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active', NOW() + INTERVAL '365 days') RETURNING id, name, slug`,
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
          `INSERT INTO companies (name, slug, plan_id, plan_name, max_employees, max_users, pepm_rate, license_key, subscription_status, trial_ends_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active', NOW() + INTERVAL '365 days') RETURNING id, name, slug`,
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
    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id) VALUES ($1,$2,$3,'admin',$4) RETURNING id, name, email, role, company_id`,
      [name.trim(), email.trim().toLowerCase(), hashed, company.id]
    );
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

// â”€â”€ LOGIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Valid email required" });
  if (!password) return res.status(400).json({ error: "Password required" });

  try {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.password, u.role, u.company_id,
              c.plan_name, c.max_employees, c.subscription_status, c.trial_ends_at
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    const dummyHash = "$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxx";
    const valid = user?.password
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid)
      return res.status(401).json({ error: "Invalid email or password" });

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

    const refreshToken = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    await db.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO NOTHING",
      [user.id, refreshToken, expiresAt]
    );
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000
    });
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: REFRESH_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    });
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        plan: user.plan_name,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// â”€â”€ FORGOT PASSWORD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Valid email required" });

  try {
    const result = await db.query(
      `SELECT id, name, email FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (!result.rows.length)
      return res.json({
        message: "If that email exists, a reset link has been sent.",
      });

    const user = result.rows[0];

    // Expire any existing tokens for this user
    await db.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id]
    );

    // Generate a secure random token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256(rawToken);

    await db.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    );

    const resetUrl = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

    // Send email if Gmail is configured
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      try {
        const transporter = getTransporter();
        await transporter.sendMail({
          from: `"MaeRoll HR" <${process.env.GMAIL_USER}>`,
          to: user.email,
          subject: "Reset your MaeRoll password",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #6366f1;">Reset Your Password</h2>
              <p>Hi ${user.name},</p>
              <p>We received a request to reset your MaeRoll password. Click the button below to set a new password:</p>
              <a href="${resetUrl}" style="display:inline-block;margin:1.5rem 0;padding:0.75rem 1.5rem;background:#6366f1;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Reset Password</a>
              <p style="color:#64748b;font-size:0.85rem;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error("Email send failed:", emailErr.message);
        // Don't fail the request if email fails â€” log it
      }
    } else {
      // No email configured â€” log token for manual sending (dev/early prod)
      console.log(`[PASSWORD RESET] Token for ${user.email}: ${rawToken}`);
      console.log(`[PASSWORD RESET] Reset URL: ${resetUrl}`);
    }

    return res.json({
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res
      .status(500)
      .json({ error: "Failed to process request. Please try again." });
  }
};

// â”€â”€ RESET PASSWORD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || token.length < 20)
    return res.status(400).json({ error: "Valid reset token required" });

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0)
    return res
      .status(400)
      .json({ error: `Password must contain: ${pwErrors.join(", ")}` });

  const tokenHash = sha256(token);

  try {
    const result = await db.query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at, u.email, u.name
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = $1`,
      [tokenHash]
    );

    if (!result.rows.length)
      return res.status(400).json({ error: "Invalid or expired reset link." });

    const row = result.rows[0];

    if (row.used_at)
      return res
        .status(400)
        .json({ error: "This reset link has already been used." });

    if (new Date(row.expires_at) < new Date())
      return res
        .status(400)
        .json({
          error: "This reset link has expired. Please request a new one.",
        });

    const hashed = await bcrypt.hash(password, 12);

    await db.query("BEGIN");
    await db.query(`UPDATE users SET password = $1 WHERE id = $2`, [
      hashed,
      row.user_id,
    ]);
    await db.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [row.id]
    );
    await db.query("COMMIT");

    return res.json({
      message: "Password reset successfully. You can now log in.",
    });
  } catch (err) {
    await db.query("ROLLBACK");
    console.error("Reset password error:", err);
    return res
      .status(500)
      .json({ error: "Failed to reset password. Please try again." });
  }
};

// â”€â”€ ACCEPT INVITE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

    const limitRes = await db.query(
      `SELECT c.max_users, COUNT(u.id) AS current_users FROM companies c LEFT JOIN users u ON u.company_id = c.id WHERE c.id = $1 GROUP BY c.max_users`,
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

// â”€â”€ LICENSE KEY VALIDATOR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

exports.validatePassword = validatePassword;

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
  try {
    const result = await db.query(
      "SELECT rt.*, u.id as uid, u.email, u.role, u.company_id, u.name, p.name as plan_name FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id LEFT JOIN plans p ON p.id = u.plan_id WHERE rt.token = $1 AND rt.expires_at > NOW()",
      [refreshToken]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Invalid or expired refresh token" });
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.uid, email: user.email, role: user.role, company_id: user.company_id, plan: user.plan_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    return res.json({ token, expiresIn: JWT_EXPIRY });
  } catch (err) {
    console.error("Refresh token error:", err);
    return res.status(500).json({ error: "Token refresh failed" });
  }
};

