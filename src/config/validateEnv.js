// File: src/config/validateEnv.js

/**
 * Validates all required environment variables on startup
 * Exits the process if any critical variables are missing or invalid
 */
function validateEnv() {
  console.log("🔍 Validating environment variables...");

  // Required environment variables
  const required = ["DATABASE_URL", "JWT_SECRET", "PORT"];

  // Check for missing variables
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ ERROR: Missing required environment variables:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nPlease add these to your .env file");
    process.exit(1);
  }

  // Validate JWT_SECRET strength
  const jwtSecret = process.env.JWT_SECRET;
  if (jwtSecret.length < 32) {
    console.error("❌ ERROR: JWT_SECRET is too weak!");
    console.error(`   Current length: ${jwtSecret.length} characters`);
    console.error("   Required: At least 32 characters");
    console.error("\nGenerate a strong secret using:");
    console.error(
      "   node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    process.exit(1);
  }

  // Validate DATABASE_URL format
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl.startsWith("postgres://") && !dbUrl.startsWith("postgresql://")) {
    console.error(
      "❌ ERROR: DATABASE_URL must start with postgres:// or postgresql://"
    );
    process.exit(1);
  }

  // Validate PORT
  const port = parseInt(process.env.PORT);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error("❌ ERROR: PORT must be a valid number between 1 and 65535");
    console.error(`   Current value: ${process.env.PORT}`);
    process.exit(1);
  }

  // Warning for development mode
  if (process.env.NODE_ENV !== "production") {
    console.log("⚠️  WARNING: Running in development mode");
  }

  // Success
  console.log("✅ Environment variables validated successfully");
  console.log(`   - Database: ${dbUrl.split("@")[1] || "Connected"}`);
  console.log(`   - JWT Secret: ${jwtSecret.length} characters (✓ Strong)`);
  console.log(`   - Port: ${port}`);
  console.log("");
}

module.exports = validateEnv;
