require("dotenv").config();
const { Pool } = require("pg");

const isProd = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Required for Render / cloud Postgres
  ssl: isProd ? { rejectUnauthorized: false } : false,

  // 🏢 enterprise stability settings
  max: 10, // max DB connections
  idleTimeoutMillis: 30000, // close idle clients after 30s
  connectionTimeoutMillis: 10000, // fail fast if DB slow
});

// Test connection on startup
pool
  .connect()
  .then((client) => {
    console.log("PostgreSQL connected ✅");
    client.release();
  })
  .catch((err) => {
    console.error("PostgreSQL connection error ❌", err.message);
  });

module.exports = pool;
