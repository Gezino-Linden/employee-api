// File: src/db.js
const { Pool } = require("pg");
const logger = require("./utils/logger");

// ═══════════════════════════════════════════════════════════════
// DATABASE CONNECTION POOL CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // SSL Configuration
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,

  // ── Connection Pool Settings ──────────────────────────────────

  // Maximum number of clients in the pool
  max: 20,

  // Minimum number of clients to keep in the pool
  min: 2,

  // How long a client is allowed to remain idle before being closed
  idleTimeoutMillis: 30000, // 30 seconds

  // Maximum time to wait for a connection from the pool
  connectionTimeoutMillis: 10000, // 10 seconds

  // Maximum time a query can run before being cancelled
  query_timeout: 30000, // 30 seconds

  // Maximum time to wait for a new connection
  statement_timeout: 30000, // 30 seconds

  // Enable keep-alive to detect dead connections
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000, // 10 seconds
});

// ═══════════════════════════════════════════════════════════════
// CONNECTION EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

// Log when a new client connects
pool.on("connect", (client) => {
  logger.debug("New database client connected", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

// Log when a client is acquired from the pool
pool.on("acquire", (client) => {
  logger.debug("Client acquired from pool", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  });
});

// Log when a client is removed from the pool
pool.on("remove", (client) => {
  logger.debug("Client removed from pool", {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
  });
});

// Handle unexpected errors on idle clients
pool.on("error", (err, client) => {
  logger.error("Unexpected error on idle database client", {
    error: err.message,
    stack: err.stack,
  });

  // Don't exit the process - let the pool handle reconnection
  // Only exit if this is a critical, unrecoverable error
  if (err.message.includes("Connection terminated unexpectedly")) {
    logger.error("Database connection lost - pool will attempt to reconnect");
  }
});

// ═══════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════

// Close pool on process termination
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Closing database pool...`);

  try {
    await pool.end();
    logger.info("Database pool closed successfully");
    process.exit(0);
  } catch (err) {
    logger.error("Error closing database pool", { error: err.message });
    process.exit(1);
  }
};

// Handle various shutdown signals
process.on("SIGINT", () => gracefulShutdown("SIGINT")); // Ctrl+C
process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // Docker/Kubernetes
process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // Nodemon restart

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK FUNCTION
// ═══════════════════════════════════════════════════════════════

pool.checkHealth = async () => {
  try {
    const start = Date.now();
    await pool.query("SELECT 1");
    const duration = Date.now() - start;

    return {
      healthy: true,
      responseTime: duration,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount,
    };
  } catch (err) {
    logger.error("Database health check failed", { error: err.message });
    return {
      healthy: false,
      error: err.message,
    };
  }
};

// ═══════════════════════════════════════════════════════════════
// HELPER METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a query with automatic error logging
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
pool.queryWithLogging = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      logger.warn("Slow query detected", {
        query: text.substring(0, 100), // First 100 chars
        duration,
        rows: result.rowCount,
      });
    }

    return result;
  } catch (err) {
    logger.error("Database query error", {
      error: err.message,
      query: text.substring(0, 100),
      params,
    });
    throw err;
  }
};

// ═══════════════════════════════════════════════════════════════
// INITIAL CONNECTION TEST
// ═══════════════════════════════════════════════════════════════

(async () => {
  try {
    const client = await pool.connect();
    logger.info("PostgreSQL connected ✅", {
      database: client.database,
      user: client.user,
      host: client.host,
      port: client.port,
    });
    client.release();
  } catch (err) {
    logger.error("Failed to connect to PostgreSQL ❌", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
})();

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

module.exports = pool;
