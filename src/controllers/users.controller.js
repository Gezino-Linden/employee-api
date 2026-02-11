const db = require("../db");
const asyncHandler = require("../utils/asyncHandler");


// GET all users
// GET all users (with pagination + search)
exports.getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "10", 10), 1),
    50
  );
  const search = (req.query.search || "").trim();
  const offset = (page - 1) * limit;

  if (search) {
    const countResult = await db.query(
      "SELECT COUNT(*)::int AS total FROM users WHERE name ILIKE $1 OR email ILIKE $1",
      [`%${search}%`]
    );
    const total = countResult.rows[0].total;

    const listResult = await db.query(
      `SELECT id, name, email, role
       FROM users
       WHERE name ILIKE $1 OR email ILIKE $1
       ORDER BY id DESC
       LIMIT $2 OFFSET $3`,
      [`%${search}%`, limit, offset]
    );

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data: listResult.rows,
    });
  }

  const countResult = await db.query(
    "SELECT COUNT(*)::int AS total FROM users"
  );
  const total = countResult.rows[0].total;

  const listResult = await db.query(
    `SELECT id, name, email, role
     FROM users
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
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
    res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "database error" });
  }
};

// CREATE user
exports.createUser = async (req, res) => {
  const { name, email } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }

  try {
    const result = await db.query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, role",
      [name.trim(), email.trim().toLowerCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "email already exists" });
    console.log(err);
    res.status(500).json({ error: "insert failed" });
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
  ) {
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  }
  if (
    email !== undefined &&
    (typeof email !== "string" || !email.includes("@"))
  ) {
    return res.status(400).json({ error: "valid email required" });
  }

  try {
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

    if (result.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "email already exists" });
    console.log(err);
    res.status(500).json({ error: "update failed" });
  }
};

// DELETE user
exports.deleteUser = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  try {
    const result = await db.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    res.status(204).send();
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "delete failed" });
  }
};

exports.updateUserRole = async (req, res) => {
  const id = Number(req.params.id);
  const { role } = req.body;

  const allowedRoles = ["user", "manager", "admin"];

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  if (!role || !allowedRoles.includes(role)) {
    return res
      .status(400)
      .json({ error: "role must be user, manager, or admin" });
  }

  // prevent self-demotion lockouts (optional but recommended)
  if (req.user.id === id && role !== "admin") {
    return res.status(400).json({ error: "cannot remove your own admin role" });
  }

  try {
    const result = await db.query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role",
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: "update role failed" });
  }
};
