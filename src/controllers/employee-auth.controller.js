// File: src/controllers/employee-auth.controller.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const crypto = require("crypto");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const EMPLOYEE_JWT_EXPIRY = "12h";

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// ── EMPLOYEE LOGIN ────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Valid email required" });
  if (!password) return res.status(400).json({ error: "Password required" });

  try {
    const result = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.department,
              e.position, e.company_id, e.portal_password, e.portal_enabled,
              e.is_active, c.name AS company_name
       FROM employees e
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.email = $1 AND e.is_active = true`,
      [email.trim().toLowerCase()]
    );

    const emp = result.rows[0];
    const dummyHash = "$2a$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxx";
    const valid = emp?.portal_password
      ? await bcrypt.compare(password, emp.portal_password)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!emp || !valid)
      return res.status(401).json({ error: "Invalid email or password" });

    if (!emp.portal_enabled)
      return res
        .status(403)
        .json({
          error:
            "Portal access has been disabled for your account. Contact HR.",
        });

    // Update last login
    await db.query(
      `UPDATE employees SET portal_last_login = NOW() WHERE id = $1`,
      [emp.id]
    );

    const token = jwt.sign(
      {
        id: emp.id,
        email: emp.email,
        company_id: emp.company_id,
        type: "employee", // distinguish from manager tokens
      },
      JWT_SECRET,
      { expiresIn: EMPLOYEE_JWT_EXPIRY }
    );

    return res.json({
      token,
      employee: {
        id: emp.id,
        name: `${emp.first_name} ${emp.last_name}`,
        email: emp.email,
        department: emp.department,
        position: emp.position,
        company_id: emp.company_id,
        company_name: emp.company_name,
      },
    });
  } catch (err) {
    console.error("Employee login error:", err);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
};

// ── GET ME ────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, e.department,
              e.position, e.company_id, e.age, e.id_number,
              e.portal_last_login, c.name AS company_name
       FROM employees e
       LEFT JOIN companies c ON c.id = e.company_id
       WHERE e.id = $1`,
      [req.employee.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Employee not found" });
    const emp = result.rows[0];
    return res.json({
      ...emp,
      name: `${emp.first_name} ${emp.last_name}`,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
};

// ── SET / RESET PORTAL PASSWORD (called by HR manager) ───────────────────────
exports.setPortalPassword = async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password)
    return res.status(400).json({ error: "employeeId and password required" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const result = await db.query(
      `UPDATE employees SET portal_password = $1, portal_enabled = true
       WHERE id = $2 AND company_id = $3
       RETURNING id, first_name, last_name, email`,
      [hashed, employeeId, req.user.company_id]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: "Employee not found" });

    return res.json({
      message: "Portal password set successfully",
      employee: result.rows[0],
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to set password" });
  }
};

// ── EMPLOYEE CHANGE OWN PASSWORD ──────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res
      .status(400)
      .json({ error: "Both current and new password required" });
  if (newPassword.length < 6)
    return res
      .status(400)
      .json({ error: "New password must be at least 6 characters" });

  try {
    const result = await db.query(
      `SELECT portal_password FROM employees WHERE id = $1`,
      [req.employee.id]
    );
    const emp = result.rows[0];
    if (!emp?.portal_password)
      return res.status(400).json({ error: "No portal password set" });

    const valid = await bcrypt.compare(currentPassword, emp.portal_password);
    if (!valid)
      return res.status(401).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.query(`UPDATE employees SET portal_password = $1 WHERE id = $2`, [
      hashed,
      req.employee.id,
    ]);
    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Failed to change password" });
  }
};

// ── TOGGLE PORTAL ACCESS ──────────────────────────────────────────────────────
exports.togglePortalAccess = async (req, res) => {
  const { employeeId, enabled } = req.body;
  try {
    await db.query(
      `UPDATE employees SET portal_enabled = $1 WHERE id = $2 AND company_id = $3`,
      [enabled, employeeId, req.user.company_id]
    );
    return res.json({
      message: `Portal access ${enabled ? "enabled" : "disabled"}`,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to update portal access" });
  }
};
