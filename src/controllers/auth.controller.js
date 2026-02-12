const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function slugifyCompany(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

exports.register = async (req, res) => {
  const { name, email, password, companyName } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name required" });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res
      .status(400)
      .json({ error: "password must be at least 6 characters" });
  }

  // Company name is required for multi-tenant SaaS onboarding
  const safeCompanyName =
    typeof companyName === "string" && companyName.trim()
      ? companyName.trim()
      : `${name.trim()}'s Company`;

  const slug = slugifyCompany(safeCompanyName);

  try {
    // prevent duplicate email
    const exists = await db.query("SELECT id FROM users WHERE email = $1", [
      email.trim().toLowerCase(),
    ]);
    if (exists.rows.length) {
      return res.status(409).json({ error: "email already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Transaction: create company + create first admin user
    await db.query("BEGIN");

    // Create company (if slug already exists, append random suffix)
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

    // First user becomes admin for that company
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
    return res.status(500).json({ error: "database error" });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password required" });
  }

  try {
    // ✅ INCLUDE company_id
    const result = await db.query(
      "SELECT id, name, email, password, role, company_id FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    const user = result.rows[0];
    if (!user || !user.password) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );


    return res.json({ token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "database error" });
  }
};

const crypto = require("crypto");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

exports.acceptInvite = async (req, res) => {
  const { token, name, password } = req.body;

  if (!token || typeof token !== "string" || token.length < 20) {
    return res.status(400).json({ error: "valid token required" });
  }
  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res
      .status(400)
      .json({ error: "password must be at least 6 characters" });
  }

  const tokenHash = sha256(token);

  try {
    await db.query("BEGIN");

    const inviteRes = await db.query(
      `SELECT id, company_id, email, role, expires_at, used_at
       FROM user_invites
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (inviteRes.rows.length === 0) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "invalid invite token" });
    }

    const invite = inviteRes.rows[0];

    if (invite.used_at) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "invite already used" });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await db.query("ROLLBACK");
      return res.status(400).json({ error: "invite expired" });
    }

    // Ensure user doesn't already exist in this company
    const existing = await db.query(
      `SELECT id FROM users WHERE email = $1 AND company_id = $2`,
      [invite.email, invite.company_id]
    );

    if (existing.rows.length > 0) {
      await db.query("ROLLBACK");
      return res
        .status(409)
        .json({ error: "user already exists in this company" });
    }

    const hashed = await bcrypt.hash(password, 10);

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
    return res.status(500).json({ error: "accept invite failed" });
  }
};
