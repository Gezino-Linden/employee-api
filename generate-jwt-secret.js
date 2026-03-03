// File: generate-jwt-secret.js
// Run this once to generate a secure JWT secret

const crypto = require("crypto");

console.log("\n🔐 JWT Secret Generator\n");
console.log("Copy one of these secrets to your .env file:\n");

// Generate 3 different secrets
for (let i = 1; i <= 3; i++) {
  const secret = crypto.randomBytes(32).toString("hex");
  console.log(`Option ${i}:`);
  console.log(`JWT_SECRET=${secret}`);
  console.log("");
}

console.log("📝 Instructions:");
console.log("1. Copy one of the secrets above");
console.log("2. Open your .env file");
console.log("3. Replace your current JWT_SECRET with the new one");
console.log("4. Save the file");
console.log("5. Restart your server\n");
