/**
 * MaeRoll License Key Generator
 *
 * Usage:
 *   node generate-license.js --plan=tier1 --hotel="Beach Inn" --email=admin@hotel.co.za --months=12
 *   node generate-license.js --plan=tier7 --hotel="Big Resort" --email=gm@resort.co.za
 */
require("dotenv").config();
const db = require("./src/db");
const crypto = require("crypto");

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, ...v] = a.slice(2).split("=");
      return [k, v.join("=")];
    })
);

const PLAN_CODES = {
  tier1: "T1",
  tier2: "T2",
  tier3: "T3",
  tier4: "T4",
  tier5: "T5",
  tier6: "T6",
  tier7: "T7",
};

const PLAN_INFO = {
  tier1: { employees: "1-25", pepm: "R100" },
  tier2: { employees: "26-50", pepm: "R90" },
  tier3: { employees: "51-100", pepm: "R80" },
  tier4: { employees: "101-200", pepm: "R70" },
  tier5: { employees: "201-350", pepm: "R60" },
  tier6: { employees: "351-500", pepm: "R50" },
  tier7: { employees: "501+", pepm: "Custom" },
};

function generateKey(plan) {
  const code = PLAN_CODES[plan] || "T1";
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  const rand2 = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `MAE-${code}-${year}-${rand}-${rand2}`;
}

async function generate() {
  const plan = args.plan || "tier1";
  const hotel = args.hotel || null;
  const email = args.email || null;
  const months = parseInt(args.months || "12");
  const notes = args.notes || null;

  if (!PLAN_CODES[plan]) {
    console.error(
      `❌ Invalid plan. Choose: tier1, tier2, tier3, tier4, tier5, tier6, tier7`
    );
    process.exit(1);
  }

  const planRes = await db.query(
    "SELECT id, display_name, max_employees, pepm_rate FROM plans WHERE name = $1",
    [plan]
  );

  if (!planRes.rows.length) {
    console.error("❌ Plan not found in DB. Run the SQL setup first.");
    process.exit(1);
  }

  const planData = planRes.rows[0];
  const key = generateKey(plan);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await db.query(
    `INSERT INTO license_keys (key, plan_id, hotel_name, contact_email, expires_at, notes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [key, planData.id, hotel, email, expiresAt, notes]
  );

  const info = PLAN_INFO[plan];
  console.log("\n" + "═".repeat(55));
  console.log("  ✅ MaeRoll License Key Generated");
  console.log("═".repeat(55));
  console.log(`  Key          : ${key}`);
  console.log(
    `  Plan         : ${planData.display_name} (${info.employees} employees)`
  );
  console.log(`  Hotel        : ${hotel || "(not specified)"}`);
  console.log(`  Email        : ${email || "(not specified)"}`);
  console.log(`  Max Employees: ${planData.max_employees}`);
  console.log(
    `  Rate         : ${
      planData.pepm_rate == 0
        ? "Custom Quote"
        : "R" + planData.pepm_rate + " PEPM"
    }`
  );
  console.log(`  Valid until  : ${expiresAt.toDateString()}`);
  console.log("═".repeat(55));
  console.log("\n  Send this key to the hotel for signup.\n");
  process.exit(0);
}

generate().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
