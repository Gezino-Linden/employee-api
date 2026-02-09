const express = require("express");
const db = require("./db");
const authRoutes = require("./routes/auth.routes");
const { requireAuth } = require("./middleware");



const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("My first API is running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));
// protected route (only logged in users)
app.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "user not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "database error" });
  }
});

app.use("/auth", authRoutes);


// GET all users
app.get("/users", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM users ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "database error" });
  }
});

// GET one user
app.get("/users/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id))
    return res.status(400).json({ error: "invalid id" });

  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "user not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "database error" });
  }
});

// CREATE user
app.post("/users", async (req, res) => {
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
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name.trim(), email.trim().toLowerCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "email already exists" });
    console.log(err);
    res.status(500).json({ error: "insert failed" });
  }
});

// UPDATE user
app.put("/users/:id", async (req, res) => {
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
    // build partial update safely
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
      )} WHERE id = $${idx} RETURNING id, name, email`,
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
});

// DELETE user
app.delete("/users/:id", async (req, res) => {
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
});

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
