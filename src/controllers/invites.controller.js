const crypto = require("crypto");
const db = require("../db");

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

exports.createInvite = async (req, res) => {
  const { email, role } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanRole =
    role && ["user", "manager", "admin"].includes(role) ? role : "user";

  // Raw token (we return this to admin), store only hash in DB
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);

  // Expires in 48 hours
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  try {
    // Prevent inviting if user already exists in same company
    const existing = await db.query(
      `SELECT id FROM users WHERE email=$1 AND company_id=$2`,
      [cleanEmail, req.user.company_id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "user already exists in this company" });
    }

    await db.query(
      `INSERT INTO user_invites (company_id, email, role, token_hash, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user.company_id,
        cleanEmail,
        cleanRole,
        tokenHash,
        expiresAt,
        req.user.id,
      ]
    );

    return res.status(201).json({
      message: "invite created",
      email: cleanEmail,
      role: cleanRole,
      expiresAt,
      token: rawToken, // admin will share this token
      acceptEndpoint: "/auth/accept-invite",
      bodyExample: {
        token: rawToken,
        name: "New User",
        password: "123456",
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "create invite failed" });
  }
};
