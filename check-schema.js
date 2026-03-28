const db = require('./src/db');
async function main() {
  const tables = ['employees', 'payroll_records', 'payroll_periods'];
  for (const t of tables) {
    try {
      const r = await db.query('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = ' + "'" + t + "'" + ' ORDER BY ordinal_position');
      console.log('\n=== ' + t + ' ===');
      r.rows.forEach(row => console.log(' ', row.column_name, '-', row.data_type));
    } catch(e) { console.log(t + ' error:', e.message); }
  }
  process.exit(0);
}
main();
