// File: src/controllers/users.controller.js
const db = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { logAudit } = require("../utils/auditLog");

const ALLOWED_ROLES = [
  "owner",
  "general_manager",
  "hr_manager",
  "accountant",
  "front_office_manager",
  "supervisor",
  "admin",
  "manager", // legacy
];

// GET all users
exports.getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "10", 10), 1),
    50
  );
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * limit;
  const companyId = req.user.company_id;

  const base = companyId ? `WHERE company_id = $1` : `WHERE 1=1`;
  const bArgs = companyId ? [companyId] : [];

  if (search) {
    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM users ${base} AND (name ILIKE $${
        bArgs.length + 1
      } OR email ILIKE $${bArgs.length + 1})`,
      [...bArgs, `%${search}%`]
    );
    const listResult = await db.query(
      `SELECT id, name, email, role FROM users ${base} AND (name ILIKE $${
        bArgs.length + 1
      } OR email ILIKE $${bArgs.length + 1}) ORDER BY id DESC LIMIT $${
        bArgs.length + 2
      } OFFSET $${bArgs.length + 3}`,
      [...bArgs, `%${search}%`, limit, offset]
    );
    return res.json({
      page,
      limit,
      total: countResult.rows[0].total,
      totalPages: Math.ceil(countResult.rows[0].total / limit),
      data: listResult.rows,
    });
  }

  const countResult = await db.query(
    `SELECT COUNT(*)::int AS total FROM users ${base}`,
    bArgs
  );
  const listResult = await db.query(
    `SELECT id, name, email, role FROM users ${base} ORDER BY id DESC LIMIT $${
      bArgs.length + 1
    } OFFSET $${bArgs.length + 2}`,
    [...bArgs, limit, offset]
  );
  return res.json({
    page,
    limit,
    total: countResult.rows[0].total,
    totalPages: Math.ceil(countResult.rows[0].total / limit),
    data: listResult.rows,
  });
});

// GET one user
exports.getUserById = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });
  try {
    const result = await db.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "database error" });
  }
};

// CREATE user
exports.createUser = async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || typeof name !== "string" || name.trim().length < 2)
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  if (!email || typeof email !== "string" || !email.includes("@"))
    return res.status(400).json({ error: "valid email required" });
  if (role && !ALLOWED_ROLES.includes(role))
    return res
      .status(400)
      .json({ error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });

  try {
    const result = await db.query(
      "INSERT INTO users (name, email, role, company_id) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role",
      [
        name.trim(),
        email.trim().toLowerCase(),
        role || "supervisor",
        req.user.company_id,
      ]
    );
    const user = result.rows[0];
    await logAudit({
      req,
      action: "CREATE",
      entityType: "user",
      entityId: user.id,
      entityName: `${user.name} (${user.email})`,
      changes: { role: { old: null, new: user.role } },
    });
    return res.status(201).json(user);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: "insert failed" });
  }
};

// UPDATE user
exports.updateUser = async (req, res) => {
  const id = Number(req.params.id);
  const { name, email } = req.body;
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });
  if (
    name !== undefined &&
    (typeof name !== "string" || name.trim().length < 2)
  )
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  if (
    email !== undefined &&
    (typeof email !== "string" || !email.includes("@"))
  )
    return res.status(400).json({ error: "valid email required" });

  try {
    const oldRes = await db.query(
      "SELECT name, email FROM users WHERE id = $1",
      [id]
    );
    if (oldRes.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    const old = oldRes.rows[0];

    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name.trim());
    }
    if (email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(email.trim().toLowerCase());
    }
    if (fields.length === 0)
      return res.status(400).json({ error: "nothing to update" });

    values.push(id);
    const result = await db.query(
      `UPDATE users SET ${fields.join(
        ", "
      )} WHERE id = $${idx} RETURNING id, name, email, role`,
      values
    );
    const user = result.rows[0];

    const changes = {};
    if (name && name !== old.name) changes.name = { old: old.name, new: name };
    if (email && email !== old.email)
      changes.email = { old: old.email, new: email };

    await logAudit({
      req,
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      entityName: user.name,
      changes,
    });
    return res.json(user);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: "update failed" });
  }
};

// DELETE user
exports.deleteUser = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });
  try {
    const result = await db.query(
      "DELETE FROM users WHERE id = $1 RETURNING id, name, email",
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    const user = result.rows[0];
    await logAudit({
      req,
      action: "DELETE",
      entityType: "user",
      entityId: id,
      entityName: `${user.name} (${user.email})`,
    });
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "delete failed" });
  }
};

// UPDATE user role
exports.updateUserRole = async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body;
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });
  if (!role || !ALLOWED_ROLES.includes(role))
    return res
      .status(400)
      .json({ error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
  if (req.user.id === id && role !== "owner" && role !== "admin")
    return res
      .status(400)
      .json({ error: "cannot remove your own owner/admin role" });

  try {
    const oldRes = await db.query(
      "SELECT name, role FROM users WHERE id = $1",
      [id]
    );
    if (oldRes.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    const oldRole = oldRes.rows[0].role;

    const result = await db.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role",
      [role, id]
    );
    const user = result.rows[0];
    await logAudit({
      req,
      action: "ROLE_CHANGE",
      entityType: "user",
      entityId: id,
      entityName: user.name,
      changes: { role: { old: oldRole, new: role } },
    });
    return res.json(user);
  } catch (err) {
    return res.status(500).json({ error: "update role failed" });
  }
};
