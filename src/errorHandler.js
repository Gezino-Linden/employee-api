module.exports = (err, req, res, next) => {
  console.error("❌ Error:", err);

  // Postgres duplicate key (unique constraint)
  if (err.code === "23505") {
    return res.status(409).json({ error: "duplicate value" });
  }

  res.status(500).json({ error: "server error" });
};
