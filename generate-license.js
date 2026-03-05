/**
 * MaeRoll License Key Generator
 * Run: node generate-license.js
 * 
 * Usage:
 *   node generate-license.js --plan=professional --hotel="Grand Hotel" --email=gm@grandhotel.co.za --months=12
 *   node generate-license.js --plan=starter --hotel="Beach Inn" --email=admin@beachinn.co.za
 */

require('dotenv').config();
const db = require('./src/db');
const crypto = require('crypto');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    })
);

const PLAN_CODES = { starter: 'STR', professional: 'PRO', enterprise: 'ENT' };

function generateKey(plan) {
  const code = PLAN_CODES[plan] || 'STR';
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  const rand2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MAE-${code}-${year}-${rand}-${rand2}`;
}

async function generate() {
  const plan     = args.plan     || 'starter';
  const hotel    = args.hotel    || null;
  const email    = args.email    || null;
  const months   = parseInt(args.months || '12');
  const notes    = args.notes    || null;

  if (!PLAN_CODES[plan]) {
    console.error(`❌ Invalid plan. Choose: starter, professional, enterprise`);
    process.exit(1);
  }

  // Get plan id
  const planRes = await db.query('SELECT id, display_name, max_employees, pepm_rate FROM plans WHERE name = $1', [plan]);
  if (!planRes.rows.length) {
    console.error('❌ Plan not found in DB. Run the SQL setup first.');
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

  console.log('\n' + '═'.repeat(55));
  console.log('  ✅ MaeRoll License Key Generated');
  console.log('═'.repeat(55));
  console.log(`  Key          : ${key}`);
  console.log(`  Plan         : ${planData.display_name}`);
  console.log(`  Hotel        : ${hotel || '(not specified)'}`);
  console.log(`  Email        : ${email || '(not specified)'}`);
  console.log(`  Max Employees: ${planData.max_employees}`);
  console.log(`  Rate         : R${planData.pepm_rate} PEPM`);
  console.log(`  Valid until  : ${expiresAt.toDateString()}`);
  console.log('═'.repeat(55));
  console.log('\n  Send this key to the hotel for signup.\n');

  process.exit(0);
}

generate().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
