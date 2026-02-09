const errorHandler = require("./errorHandler");

const express = require("express");
require("dotenv").config();

const db = require("./db");
const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const { requireAuth } = require("./middleware");

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("My first API is running 🚀"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Protected route: return the currently logged-in user
app.get("/me", requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email, role FROM users WHERE id = $1",
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

// Routes
app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use(errorHandler);


const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
