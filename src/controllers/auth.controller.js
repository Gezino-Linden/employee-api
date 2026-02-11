const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";


// REGISTER
exports.register = async (req, res) => {
  const { name, email, password, role, companyName } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res
      .status(400)
      .json({ error: "name must be at least 2 characters" });
  }
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res
      .status(400)
      .json({ error: "password must be at least 6 characters" });
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const hashed = await bcrypt.hash(password, 10);

    await db.query("BEGIN");

    // ✅ Create a company for this signup (if companyName not provided, default to user's name + " Company")
    const company_name =
      typeof companyName === "string" && companyName.trim().length > 1
        ? companyName.trim()
        : `${cleanName}'s Company`;

    const companyRes = await db.query(
      `INSERT INTO companies (name) VALUES ($1) RETURNING id, name`,
      [company_name]
    );

    const companyId = companyRes.rows[0].id;

    // ✅ First user of their company becomes admin (ignore role from client)
    const finalRole = "admin";

    const userRes = await db.query(
      `INSERT INTO users (name, email, password, role, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, company_id`,
      [cleanName, cleanEmail, hashed, finalRole, companyId]
    );

    await db.query("COMMIT");

    return res.status(201).json({
      ...userRes.rows[0],
      company: companyRes.rows[0],
    });
  } catch (err) {
    await db.query("ROLLBACK");

    if (err.code === "23505") {
      return res.status(409).json({ error: "email already exists" });
    }
    console.log(err);
    return res.status(500).json({ error: "register failed" });
  }
};




// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "valid email required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password required" });
  }

  try {
    const result = await db.query(
      "SELECT id, name, email, password, role FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );


    const user = result.rows[0];
    if (!user || !user.password)
      return res.status(401).json({ error: "invalid credentials" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        company_id: user.company_id, 
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );



    res.json({ token });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "login failed" });
  }
};
