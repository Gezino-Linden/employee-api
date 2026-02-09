require("dotenv").config();
const { Pool } = require("pg");

const isProd = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : { rejectUnauthorized: false }, // allow Render SSL locally too
});

pool
  .query("SELECT NOW()")
  .then(() => console.log("PostgreSQL connected ✅"))
  .catch((err) => console.error("PostgreSQL connection error ❌", err.message));

module.exports = pool;
