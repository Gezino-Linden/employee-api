/**
 * MaeRoll License Key Generator (v2)
 *
 * Usage:
 *   node generate-license.js --plan=operations --hotel="Beach Inn" --email=admin@hotel.co.za --months=12
 *   node generate-license.js --plan=intelligence --hotel="Grand Hotel" --email=gm@grand.co.za
 *   node generate-license.js --plan=performance --hotel="Hotel Group" --email=cfo@group.co.za
 *   node generate-license.js --plan=enterprise --hotel="Chain Hotels" --email=it@chain.co.za
 *
 * Plans:
 *   operations   → tier3  → R95/emp   → up to 50 employees
 *   intelligence → tier3  → R135/emp  → up to 150 employees  ⭐ Most Popular
 *   performance  → tier6  → R175/emp  → up to 500 employees
 *   enterprise   → tier7  → Custom    → unlimited
 */
require('dotenv').config();
const db     = require('./src/db');
const crypto = require('crypto');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...v] = a.slice(2).split('=');
      return [k, v.join('=')];
    })
);

// Map friendly plan name → your DB tier name
const PLAN_TO_TIER = {
  operations:   'tier2',  // 50 employees, R95
  intelligence: 'tier3',  // 150 employees, R135 ⭐
  performance:  'tier6',  // 500 employees, R175
  enterprise:   'tier7',  // unlimited
};

const PLAN_CODES = {
  operations:   'OPS',
  intelligence: 'INT',
  performance:  'PRF',
  enterprise:   'ENT',
};

const PLAN_DESCRIPTIONS = {
  operations:   { price: 'R95/emp/month',   max: '50 employees',  setup: 'R2,500 once-off',  training: '2hrs online' },
  intelligence: { price: 'R135/emp/month',  max: '150 employees', setup: 'R5,000 once-off',  training: '4hrs online' },
  performance:  { price: 'R175/emp/month',  max: '500 employees', setup: 'R12,000 once-off', training: '1 day on-site' },
  enterprise:   { price: 'Custom',          max: 'Unlimited',     setup: 'Custom',            training: 'Custom' },
};

function generateKey(plan) {
  const code  = PLAN_CODES[plan] || 'OPS';
  const year  = new Date().getFullYear();
  const rand1 = crypto.randomBytes(3).toString('hex').toUpperCase();
  const rand2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `MAE-${code}-${year}-${rand1}-${rand2}`;
}

async function generate() {
  const planFriendly = (args.plan || 'operations').toLowerCase();
  const hotel        = args.hotel  || null;
  const email        = args.email  || null;
  const months       = parseInt(args.months || '12');
  const notes        = args.notes  || null;

  if (!PLAN_TO_TIER[planFriendly]) {
    console.error(`\n❌ Invalid plan: "${planFriendly}"`);
    console.error(`   Choose: operations, intelligence, performance, enterprise\n`);
    process.exit(1);
  }

  const tierName = PLAN_TO_TIER[planFriendly];

  const planRes = await db.query(
    'SELECT id, display_name, max_employees, pepm_rate FROM plans WHERE name = $1',
    [tierName]
  );

  if (!planRes.rows.length) {
    console.error(`\n❌ Plan "${tierName}" not found in DB. Run the SQL migration first.\n`);
    process.exit(1);
  }

  const planData  = planRes.rows[0];
  const key       = generateKey(planFriendly);
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + months);

  await db.query(
    `INSERT INTO license_keys (key, plan_id, hotel_name, contact_email, expires_at, notes, issued_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'maeroll-admin')`,
    [key, planData.id, hotel, email, expiresAt, notes]
  );

  const desc = PLAN_DESCRIPTIONS[planFriendly];

  console.log('\n' + '═'.repeat(60));
  console.log('  ✅  MaeRoll License Key Generated');
  console.log('═'.repeat(60));
  console.log(`  Key          : ${key}`);
  console.log(`  Plan         : ${planData.display_name} (${planFriendly})`);
  console.log(`  Pricing      : ${desc.price}`);
  console.log(`  Max Employees: ${desc.max}`);
  console.log(`  Setup Fee    : ${desc.setup}`);
  console.log(`  Training     : ${desc.training}`);
  console.log(`  Hotel        : ${hotel  || '(not specified)'}`);
  console.log(`  Email        : ${email  || '(not specified)'}`);
  console.log(`  Valid until  : ${expiresAt.toDateString()} (${months} months)`);
  console.log('═'.repeat(60));
  console.log('\n  Send this key to the hotel admin for activation.\n');
  console.log('  They activate it via: Settings → License → Enter Key\n');

  process.exit(0);
}

generate().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
