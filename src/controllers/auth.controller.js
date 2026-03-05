// src/controllers/auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "8h"; // 8 hour working day

// ── In-memory rate limiter (no extra dependencies needed) ──────────────────
// Tracks failed login attempts per IP
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || {
    count: 0,
    firstAttempt: now,
    lockedUntil: 0,
  };

  // Check if currently locked
  if (attempts.lockedUntil > now) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60000);
    return {
      blocked: true,
      message: `Too many failed login attempts. Try again in ${minutesLeft} minute${
        minutesLeft > 1 ? "s" : ""
      }.`,
    };
  }

  // Reset window if expired
  if (now - attempts.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { blocked: false };
  }

  return { blocked: false, attempts };
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || {
    count: 0,
    firstAttempt: now,
    lockedUntil: 0,
  };

  attempts.count += 1;

  if (attempts.count >= MAX_ATTEMPTS) {
    attempts.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
    attempts.count = 0; // reset counter after locking
  }

  loginAttempts.set(ip, attempts);
}

function clearAttempts(ip) {
  loginAttempts.delete(ip);
}

// ── Password complexity validator ──────────────────────────────────────────
function validatePassword(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push("at least 8 characters");
  if (!/[A-Z]/.test(password)) errors.push("one uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("one number");
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    errors.push("one special character (!@#$%^&* etc.)");
  return errors;
}

// ── SA tax number validator (10 digits) ───────────────────────────────────
function validateTaxNumber(taxNumber) {
  if (!taxNumber) return true; // optional field
  return /^\d{10}$/.test(taxNumber.trim());
}

// ── SA ID number validator (Luhn algorithm) ───────────────────────────────
function validateSAIDNumber(idNumber) {
  if (!idNumber) return true; // optional field
  const id = idNumber.replace(/\s/g, "");
  if (!/^\d{13}$/.test(id)) return false;

  // Validate date of birth portion
  const year = parseInt(id.substring(0, 2));
  const month = parseInt(id.substring(2, 4));
  const day = parseInt(id.substring(4, 6));
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  // Luhn algorithm check
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = parseInt(id[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function slugifyCompany(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ── REGISTER ───────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { name, email, password, companyName } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "Name must be at least 2 characters" });
  }

  if (
    !email ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: "Valid email address required" });
  }

  // Password complexity check
  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) {
    return res.status(400).json({
      error: `Password must contain: ${pwErrors.join(", ")}`,
    });
  }

  if (
    !companyName ||
    typeof companyName !== "string" ||
    companyName.trim().length < 2
  ) {
    return res.status(400).json({ error: "Company name is required" });
  }

  const safeCompanyName = companyName.trim();
  const slug = slugifyCompany(safeCompanyName);

  try {
    const exists = await db.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (exists.rows.length) {
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const hashed = await bcrypt.hash(password, 12); // increased from 10 to 12

    await db.query("BEGIN");

    let companyRes = await db
      .query(
        "INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id, name, slug",
        [safeCompanyName, slug]
      )
      .catch(async () => null);

    if (!companyRes) {
      const fallbackSlug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
      companyRes = await db.query(
        "INSERT INTO companies (name, slug) VALUES ($1, $2) RETURNING id, name, slug",
        [safeCompanyName, fallbackSlug]
      );
    }

    const company = companyRes.rows[0];

    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id)
       VALUES ($1, $2, $3, 'admin', $4)
       RETURNING id, name, email, role, company_id`,
      [name.trim(), email.trim().toLowerCase(), hashed, company.id]
    );

    await db.query("COMMIT");
    return res.status(201).json(userRes.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res
      .status(500)
      .json({ error: "Registration failed. Please try again." });
  }
};

// ── LOGIN ──────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const { email, password } = req.body;

  // Rate limit check
  const rateCheck = checkRateLimit(ip);
  if (rateCheck.blocked) {
    return res.status(429).json({ error: rateCheck.message });
  }

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email address required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "Password is required" });
  }

  try {
    const result = await db.query(
      "SELECT id, name, email, password, role, company_id FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];

    // Always run bcrypt compare to prevent timing attacks
    const dummyHash =
      "$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxxxxx";
    const valid = user?.password
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!user || !valid) {
      recordFailedAttempt(ip);
      // Generic message — don't reveal if email exists
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Successful login — clear rate limit
    clearAttempts(ip);

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
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
      },
      expiresIn: JWT_EXPIRY,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// ── ACCEPT INVITE ──────────────────────────────────────────────────────────
exports.acceptInvite = async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || typeof token !== "string" || token.length < 20) {
    return res.status(400).json({ error: "Valid invite token required" });
  }
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "Name must be at least 2 characters" });
  }

  const pwErrors = validatePassword(password);
  if (pwErrors.length > 0) {
    return res.status(400).json({
      error: `Password must contain: ${pwErrors.join(", ")}`,
    });
  }

  const tokenHash = sha256(token);

  try {
    await db.query("BEGIN");

    const inviteRes = await db.query(
      `SELECT id, company_id, email, role, expires_at, used_at
       FROM user_invites WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!inviteRes.rows.length) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "Invalid or expired invite link" });
    }

    const invite = inviteRes.rows[0];

    if (invite.used_at) {
      await db.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "This invite link has already been used" });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await db.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "This invite link has expired. Request a new one." });
    }

    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND company_id = $2`,
      [invite.email, invite.company_id]
    );
    if (existing.rows.length > 0) {
      await db.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });
    }

    const hashed = await bcrypt.hash(password, 12);

    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, company_id`,
      [name.trim(), invite.email, hashed, invite.role, invite.company_id]
    );

    await db.query(`UPDATE user_invites SET used_at = now() WHERE id = $1`, [
      invite.id,
    ]);
    await db.query("COMMIT");

    return res.status(201).json(userRes.rows[0]);
  } catch (err) {
    await db.query("ROLLBACK");
    console.error(err);
    return res
      .status(500)
      .json({ error: "Failed to accept invite. Please try again." });
  }
};

// ── EXPORT VALIDATORS (for use in other controllers) ──────────────────────
exports.validateSAIDNumber = validateSAIDNumber;
exports.validateTaxNumber = validateTaxNumber;
