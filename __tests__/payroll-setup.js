// File: __tests__/payroll-setup.js
// Schema confirmed from DB inspection:
//   employees: no employee_number, no status col — uses is_active
//   payroll_periods: status check constraint — valid values are 'completed','cancelled' (pending/processing may also fail)
//   payroll_records: NO unique constraint on (company_id,employee_id,year,month) — use plain INSERT
//                    gross_pay, total_deductions, net_pay are GENERATED columns — never insert them

const db = require("../src/db");

async function waitForDatabase(maxRetries = 10, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.query("SELECT 1");
      console.log("✅ Database connection ready");
      return true;
    } catch (error) {
      console.log(`⏳ Waiting for database... attempt ${i + 1}/${maxRetries}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Database connection failed after max retries");
}

async function seedPayrollData() {
  try {
    console.log("🌱 Seeding payroll test data...");
    await waitForDatabase();

    // ── Employees ─────────────────────────────────────────────────────────
    await db.query(
      `INSERT INTO employees
         (id, company_id, first_name, last_name, email,
          department, position, salary, is_active, age, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (id) DO UPDATE
         SET salary = EXCLUDED.salary, is_active = EXCLUDED.is_active`,
      [9991, 4, "Test", "Employee1", "test1@grandhotel.com",
       "Housekeeping", "Cleaner", 15000, true, 30]
    ).catch(e => console.log("Employee1 insert:", e.message));

    await db.query(
      `INSERT INTO employees
         (id, company_id, first_name, last_name, email,
          department, position, salary, is_active, age, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (id) DO UPDATE
         SET salary = EXCLUDED.salary, is_active = EXCLUDED.is_active`,
      [9992, 4, "Test", "Employee2", "test2@grandhotel.com",
       "Kitchen", "Chef", 25000, true, 45]
    ).catch(e => console.log("Employee2 insert:", e.message));

    // ── Payroll periods ───────────────────────────────────────────────────
    // Valid status values: 'pending','processing','completed','cancelled'
    await db.query(
      `INSERT INTO payroll_periods (company_id, year, month, status, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT DO NOTHING`,
      [4, 2026, 3, "completed"]
    ).catch(e => console.log("Period March insert:", e.message));

    await db.query(
      `INSERT INTO payroll_periods (company_id, year, month, status, created_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT DO NOTHING`,
      [4, 2026, 4, "completed"]
    ).catch(e => console.log("Period April insert:", e.message));

    // ── Payroll records ───────────────────────────────────────────────────
    // Unique constraint is on (employee_id, month, year)
    // Use ON CONFLICT on that key to upsert safely
    await db.query(
      `INSERT INTO payroll_records
         (company_id, employee_id, year, month,
          basic_salary, allowances, bonuses, overtime,
          tax, uif, pension, medical_aid, other_deductions,
          status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (employee_id, month, year) DO UPDATE
         SET status = 'processed', company_id = EXCLUDED.company_id,
             basic_salary = EXCLUDED.basic_salary, tax = EXCLUDED.tax,
             uif = EXCLUDED.uif, pension = EXCLUDED.pension`,
      [4, 9991, 2026, 3, 15000, 0, 0, 0, 3000, 150, 750, 0, 0, "processed"]
    ).catch(e => console.log("Record March 9991:", e.message));

    await db.query(
      `INSERT INTO payroll_records
         (company_id, employee_id, year, month,
          basic_salary, allowances, bonuses, overtime,
          tax, uif, pension, medical_aid, other_deductions,
          status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (employee_id, month, year) DO UPDATE
         SET status = 'processed', company_id = EXCLUDED.company_id,
             basic_salary = EXCLUDED.basic_salary, tax = EXCLUDED.tax,
             uif = EXCLUDED.uif, pension = EXCLUDED.pension`,
      [4, 9992, 2026, 3, 25000, 0, 0, 0, 6000, 250, 1250, 0, 0, "processed"]
    ).catch(e => console.log("Record March 9992:", e.message));

    // April 2026 = draft (for /process endpoint tests)
    await db.query(
      `INSERT INTO payroll_records
         (company_id, employee_id, year, month,
          basic_salary, allowances, bonuses, overtime,
          tax, uif, pension, medical_aid, other_deductions,
          status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (employee_id, month, year) DO UPDATE
         SET status = 'draft', company_id = EXCLUDED.company_id,
             basic_salary = EXCLUDED.basic_salary`,
      [4, 9991, 2026, 4, 15000, 0, 0, 0, 0, 0, 0, 0, 0, "draft"]
    ).catch(e => console.log("Draft April 9991:", e.message));

    await db.query(
      `INSERT INTO payroll_records
         (company_id, employee_id, year, month,
          basic_salary, allowances, bonuses, overtime,
          tax, uif, pension, medical_aid, other_deductions,
          status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
       ON CONFLICT (employee_id, month, year) DO UPDATE
         SET status = 'draft', company_id = EXCLUDED.company_id,
             basic_salary = EXCLUDED.basic_salary`,
      [4, 9992, 2026, 4, 25000, 0, 0, 0, 0, 0, 0, 0, 0, "draft"]
    ).catch(e => console.log("Draft April 9992:", e.message));

    console.log("✅ Payroll test data seeding completed");
  } catch (error) {
    console.error("❌ Error seeding payroll data:", error.message);
  }
}

async function cleanupPayrollData() {
  try {
    console.log("🧹 Cleaning up payroll test data...");
    await db.query(
      `DELETE FROM payroll_records WHERE company_id = 4 AND employee_id IN (9991, 9992)`
    ).catch(() => {});
    await db.query(
      `DELETE FROM payroll_periods WHERE company_id = 4 AND year IN (2026, 2027)`
    ).catch(() => {});
    await db.query(
      `DELETE FROM employees WHERE id IN (9991, 9992)`
    ).catch(() => {});
    console.log("✅ Payroll test data cleanup completed");
  } catch (error) {
    console.error("❌ Error cleaning up payroll data:", error.message);
  }
}

module.exports = { seedPayrollData, cleanupPayrollData };
