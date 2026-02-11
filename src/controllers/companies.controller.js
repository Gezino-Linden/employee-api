const db = require("../db");

// simple slugify without extra dependency
function slugify(input) {
  return String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

exports.createCompany = async (req, res) => {
  const { name, slug } = req.body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "company name is required" });
  }

  const cleanName = name.trim();
  const cleanSlug =
    slug && typeof slug === "string" ? slugify(slug) : slugify(cleanName);

  try {
    const result = await db.query(
      `INSERT INTO companies (name, slug)
       VALUES ($1, $2)
       RETURNING id, name, slug, created_at`,
      [cleanName, cleanSlug]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    // unique violation on slug
    if (err.code === "23505") {
      return res.status(409).json({ error: "company slug already exists" });
    }
    console.error(err);
    return res.status(500).json({ error: "create company failed" });
  }
};

exports.getMyCompany = async (req, res) => {
  try {
    const companyId = req.user.company_id;
    const result = await db.query(
      `SELECT id, name, slug, created_at
       FROM companies
       WHERE id = $1`,
      [companyId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "company not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "get company failed" });
  }
};
