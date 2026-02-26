// File: src/migrations/fix-payroll-init.js
// Run once to fix the initialize_payroll_period function
// to not filter by employee status

const db = require("../db");

async function run() {
  console.log("Fixing initialize_payroll_period function...");

  await db.query(`
    CREATE OR REPLACE FUNCTION initialize_payroll_period(
      p_company_id INTEGER,
      p_month INTEGER,
      p_year INTEGER
    ) RETURNS INTEGER AS $$
    DECLARE
      v_count INTEGER := 0;
    BEGIN
      INSERT INTO payroll_records (
        company_id, employee_id, month, year,
        basic_salary, allowances, bonuses, overtime,
        gross_pay, tax, uif, pension, medical_aid,
        other_deductions, total_deductions, net_pay, status
      )
      SELECT 
        p_company_id,
        e.id,
        p_month,
        p_year,
        COALESCE(e.basic_salary, 0),
        0,
        0,
        0,
        COALESCE(e.basic_salary, 0),
        ROUND((COALESCE(e.basic_salary, 0) * 0.18)::numeric, 2),
        ROUND((COALESCE(e.basic_salary, 0) * 0.01)::numeric, 2),
        0,
        0,
        0,
        ROUND((COALESCE(e.basic_salary, 0) * 0.19)::numeric, 2),
        ROUND((COALESCE(e.basic_salary, 0) * 0.81)::numeric, 2),
        'draft'
      FROM employees e
      WHERE e.company_id = p_company_id
      ON CONFLICT (company_id, employee_id, month, year) DO NOTHING;

      GET DIAGNOSTICS v_count = ROW_COUNT;
      RETURN v_count;
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log("Function updated successfully!");

  // Test it
  const test = await db.query(
    `SELECT COUNT(*) FROM employees WHERE company_id = (SELECT id FROM companies LIMIT 1)`
  );
  console.log("Total employees found:", test.rows[0].count);

  process.exit(0);
}

run().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
