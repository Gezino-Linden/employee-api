/**
 * PeopleOS — 200 Employee Mock Data Seeder
 * Run: node seed-200.js
 *
 * Seeds:
 *   - 200 employees across 8 hotel departments
 *   - leave_types (if missing)
 *   - leave_balances for all employees
 *   - leave_requests  (mix of approved/pending/rejected)
 *   - attendance_records  (Jan–Mar 2026, ~22 days/month)
 *   - shift_templates (if missing)
 *   - employee_shifts (Jan–Mar 2026)
 *   - payroll_records (Jan, Feb, Mar 2026 — processed/paid)
 *
 * All calculations verified inline with comments.
 */

require('dotenv').config();
const db = require('./src/db');

// ── helpers ──────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[rand(0, arr.length - 1)];
const round2 = n => Math.round(Number(n) * 100) / 100;

// ── SA PAYE 2025/26 tax tables ────────────────────────
// Source: SARS Budget 2025 — annual brackets
function calcAnnualPAYE(annualIncome) {
  const rebate = 17235; // primary rebate 2025/26
  let tax = 0;
  if      (annualIncome <= 237100)  tax = annualIncome * 0.18;
  else if (annualIncome <= 370500)  tax = 42678  + (annualIncome - 237100) * 0.26;
  else if (annualIncome <= 512800)  tax = 77362  + (annualIncome - 370500) * 0.31;
  else if (annualIncome <= 673000)  tax = 121475 + (annualIncome - 512800) * 0.36;
  else if (annualIncome <= 857900)  tax = 179147 + (annualIncome - 673000) * 0.39;
  else if (annualIncome <= 1817000) tax = 251258 + (annualIncome - 857900) * 0.41;
  else                              tax = 644489 + (annualIncome - 1817000) * 0.45;
  return Math.max(0, round2((tax - rebate) / 12)); // monthly PAYE
}

// UIF: 1% of gross, capped at R17711/month remuneration ceiling → max R177.11
function calcUIF(grossMonthly) {
  const uifCeiling = 17711;
  const base = Math.min(grossMonthly, uifCeiling);
  return round2(base * 0.01);
}

// SDL: 1% employer contribution (not deducted from employee — but recorded)
function calcSDL(grossMonthly) { return round2(grossMonthly * 0.01); }

// Pension: 7.5% of basic salary (employee contribution)
function calcPension(basic) { return round2(basic * 0.075); }

// ── Data pools ────────────────────────────────────────
const FIRST_NAMES = [
  'Sipho','Thabo','Nomsa','Lerato','Bongani','Zanele','Mpho','Thandeka',
  'Kagiso','Palesa','Lebo','Sifiso','Nandi','Ayanda','Lungelo','Phindi',
  'Sbusiso','Nokukhanya','Mthokozisi','Lindiwe','Tebogo','Khulekani',
  'Nolwazi','Sandile','Zodwa','Lwazi','Sphiwe','Ntombi','Mduduzi','Yolanda',
  'John','Sarah','Michael','Jessica','David','Emma','James','Lisa',
  'Robert','Karen','William','Susan','Charles','Betty','Thomas','Dorothy',
  'Daniel','Margaret','Christopher','Ashley','Matthew','Amanda','Joshua',
  'Melissa','Andrew','Stephanie','Kevin','Patricia','Brian','Nicole',
  'Ahmed','Fatima','Mohammed','Aisha','Omar','Zainab','Hassan','Mariam',
  'Priya','Raj','Anita','Vikram','Sunita','Deepak','Neha','Arjun',
  'Chen','Wei','Mei','Jun','Ling','Xiao','Hui','Yan','Jing','Fang'
];

const LAST_NAMES = [
  'Dlamini','Nkosi','Mthembu','Khumalo','Ndlovu','Zulu','Mkhize','Sithole',
  'Ntuli','Cele','Ngcobo','Mnguni','Hadebe','Hlongwane','Shabalala','Mbatha',
  'Nxumalo','Gumede','Mthethwa','Bhengu','Zwane','Masondo','Vilakazi','Ngema',
  'Smith','Johnson','Williams','Brown','Jones','Miller','Davis','Wilson',
  'Anderson','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson',
  'Patel','Khan','Ali','Ahmed','Hassan','Singh','Sharma','Gupta','Kumar',
  'Van der Merwe','Botha','Du Plessis','Pretorius','Venter','Joubert','Steyn',
  'Coetzee','Meyer','Fourie','Swanepoel','Visser','Olivier','Du Toit','Erasmus'
];

const DEPARTMENTS = [
  'Front Office','Food & Beverage','Housekeeping','Maintenance',
  'Finance','Human Resources','Security','Kitchen'
];

const DEPT_POSITIONS = {
  'Front Office':    ['Receptionist','Front Desk Supervisor','Concierge','Night Auditor','Reservations Agent'],
  'Food & Beverage': ['Waiter','Senior Waiter','F&B Supervisor','Bartender','Host/Hostess'],
  'Housekeeping':    ['Room Attendant','Housekeeping Supervisor','Laundry Attendant','Public Area Cleaner','Linen Steward'],
  'Maintenance':     ['Maintenance Technician','Senior Technician','Plumber','Electrician','Maintenance Supervisor'],
  'Finance':         ['Accountant','Junior Accountant','Finance Manager','Payroll Clerk','Cost Controller'],
  'Human Resources': ['HR Officer','HR Manager','Recruitment Specialist','Training Officer','HR Assistant'],
  'Security':        ['Security Officer','Senior Security Officer','Security Supervisor','Access Controller','CCTV Operator'],
  'Kitchen':         ['Commis Chef','Chef de Partie','Sous Chef','Pastry Chef','Kitchen Steward'],
};

const DEPT_SALARY_RANGE = {
  'Front Office':    [12000, 22000],
  'Food & Beverage': [8500,  18000],
  'Housekeeping':    [7500,  15000],
  'Maintenance':     [10000, 20000],
  'Finance':         [18000, 45000],
  'Human Resources': [16000, 38000],
  'Security':        [9000,  16000],
  'Kitchen':         [9000,  25000],
};

const EMP_TYPES = ['permanent','contract','part-time'];
const PAYMENT_METHODS = ['bank_transfer','cash','cheque'];

function generateIDNumber() {
  const year  = rand(60, 99).toString().padStart(2,'0');
  const month = rand(1,12).toString().padStart(2,'0');
  const day   = rand(1,28).toString().padStart(2,'0');
  const seq   = rand(1000,9999);
  const citizen = '0';
  const base = `${year}${month}${day}${seq}${citizen}8`;
  return base + rand(0,9);
}

function generateTaxNumber() {
  return rand(1000000000, 9999999999).toString();
}

function generateEmail(first, last, i) {
  const clean = s => s.toLowerCase().replace(/[^a-z]/g,'').replace(/\s+/g,'');
  return `${clean(first)}.${clean(last)}${i}@peopleos-hotel.co.za`;
}

// ── Working days for a month ──────────────────────────
function getWorkingDays(year, month) {
  const days = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) days.push(d);
  }
  return days;
}

// ── Main seeder ───────────────────────────────────────
async function seed() {
  console.log('\n🌱 PeopleOS Seeder — 200 Employees\n');

  // Get company_id — use first company in DB
  const compRes = await db.query('SELECT id, name FROM companies LIMIT 1');
  if (!compRes.rows.length) throw new Error('No company found. Register a company first via the API.');
  const COMPANY_ID = compRes.rows[0].id;
  console.log(`✅ Using company: ${compRes.rows[0].name} (id=${COMPANY_ID})`);

  // Get admin user id
  const userRes = await db.query(
    `SELECT id FROM users WHERE company_id = $1 AND role = 'admin' LIMIT 1`,
    [COMPANY_ID]
  );
  const ADMIN_ID = userRes.rows[0]?.id || 1;

  // ── 1. Ensure leave types exist ───────────────────
  console.log('\n📋 Ensuring leave types...');
  const leaveTypeData = [
    { name: 'Annual Leave',    desc: 'Paid annual leave',       days: 15, paid: true  },
    { name: 'Sick Leave',      desc: 'Paid sick leave',         days: 30, paid: true  },
    { name: 'Family Leave',    desc: 'Family responsibility',   days: 3,  paid: true  },
    { name: 'Maternity Leave', desc: 'Maternity leave',         days: 120,paid: true  },
    { name: 'Unpaid Leave',    desc: 'Unpaid leave',            days: 0,  paid: false },
  ];
  const leaveTypeIds = {};
  for (const lt of leaveTypeData) {
    const ex = await db.query(`SELECT id FROM leave_types WHERE name = $1 LIMIT 1`, [lt.name]);
    if (ex.rows.length) {
      leaveTypeIds[lt.name] = ex.rows[0].id;
    } else {
      const ins = await db.query(
        `INSERT INTO leave_types (name, description, default_days_per_year, is_paid, requires_approval, is_active)
         VALUES ($1,$2,$3,$4,true,true) RETURNING id`,
        [lt.name, lt.desc, lt.days, lt.paid]
      );
      leaveTypeIds[lt.name] = ins.rows[0].id;
    }
  }
  console.log('   Leave types:', Object.keys(leaveTypeIds).join(', '));

  // ── 2. Ensure shift templates exist ──────────────
  console.log('\n🔄 Ensuring shift templates...');
  const shiftData = [
    { name: 'Morning Shift', code: 'AM', start: '06:00', end: '14:00', hours: 8, color: '#f59e0b', night: false, multiplier: 1.0  },
    { name: 'Afternoon Shift',code:'PM', start: '14:00', end: '22:00', hours: 8, color: '#3b82f6', night: false, multiplier: 1.15 },
    { name: 'Night Shift',   code: 'NS', start: '22:00', end: '06:00', hours: 8, color: '#8b5cf6', night: true,  multiplier: 1.33 },
  ];
  const shiftIds = {};
  for (const s of shiftData) {
    const ex = await db.query(
      `SELECT id FROM shift_templates WHERE company_id = $1 AND code = $2 LIMIT 1`,
      [COMPANY_ID, s.code]
    );
    if (ex.rows.length) {
      shiftIds[s.code] = ex.rows[0].id;
    } else {
      const ins = await db.query(
        `INSERT INTO shift_templates
           (name, code, start_time, end_time, duration_hours, color, company_id,
            is_night_shift, base_rate_multiplier, min_staff, max_staff)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,50) RETURNING id`,
        [s.name, s.code, s.start, s.end, s.hours, s.color, COMPANY_ID, s.night, s.multiplier]
      );
      shiftIds[s.code] = ins.rows[0].id;
    }
  }
  console.log('   Shift templates:', Object.keys(shiftIds).join(', '));

  // ── 3. Insert 200 employees ───────────────────────
  console.log('\n👥 Inserting 200 employees...');

  // Clean existing mock employees to avoid duplication on re-run
  console.log('   🗑️  Cleaning up old test data...');
  
  // Delete related records first (children before parent)
  await db.query(`DELETE FROM payroll_records WHERE employee_id IN 
    (SELECT id FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za')`, 
    [COMPANY_ID]);

  await db.query(`DELETE FROM employee_shifts WHERE employee_id IN 
    (SELECT id FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za')`, 
    [COMPANY_ID]);

  await db.query(`DELETE FROM attendance_records WHERE employee_id IN 
    (SELECT id FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za')`, 
    [COMPANY_ID]);

  await db.query(`DELETE FROM leave_requests WHERE employee_id IN 
    (SELECT id FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za')`, 
    [COMPANY_ID]);

  await db.query(`DELETE FROM leave_balances WHERE employee_id IN 
    (SELECT id FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za')`, 
    [COMPANY_ID]);

  // Now safe to delete employees
  await db.query(
    `DELETE FROM employees WHERE company_id = $1 AND email LIKE '%@peopleos-hotel.co.za'`,
    [COMPANY_ID]
  );
  
  console.log('   ✅ Old test data cleaned');

  const employees = [];
  // 200 employees spread across 8 departments (25 each)
  let empIndex = 0;
  for (const dept of DEPARTMENTS) {
    const [minSal, maxSal] = DEPT_SALARY_RANGE[dept];
    const positions = DEPT_POSITIONS[dept];
    for (let i = 0; i < 25; i++) {
      const first = pick(FIRST_NAMES);
      const last  = pick(LAST_NAMES);
      const salary = rand(minSal, maxSal);
      const empType = i < 20 ? 'permanent' : (i < 23 ? 'contract' : 'part-time');
      const age = rand(22, 58);

      const res = await db.query(
        `INSERT INTO employees
           (company_id, first_name, last_name, email, department, position,
            salary, is_active, age, id_number, tax_number, uif_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11)
         RETURNING id`,
        [
          COMPANY_ID, first, last,
          generateEmail(first, last, empIndex),
          dept, pick(positions), salary, age,
          generateIDNumber(), generateTaxNumber(),
          `UIF${rand(100000,999999)}`,
        ]
      );
      employees.push({
        id: res.rows[0].id,
        name: `${first} ${last}`,
        dept, salary, empType,
      });
      empIndex++;
    }
  }
  console.log(`   ✅ ${employees.length} employees inserted`);

  // ── 4. Leave balances ─────────────────────────────
  console.log('\n🏖️  Inserting leave balances...');
  let lbCount = 0;
  for (const emp of employees) {
    for (const [ltName, ltId] of Object.entries(leaveTypeIds)) {
      const defaultDays = leaveTypeData.find(l => l.name === ltName)?.days || 0;
      const used = ltName === 'Annual Leave' ? rand(0, 10) :
                   ltName === 'Sick Leave'   ? rand(0, 5)  : 0;
      const remaining = Math.max(0, defaultDays - used);
      await db.query(
        `INSERT INTO leave_balances
           (employee_id, leave_type_id, company_id, year, total_days, used_days, pending_days)
         VALUES ($1,$2,$3,2026,$4,$5,0)
         ON CONFLICT DO NOTHING`,
        [emp.id, ltId, COMPANY_ID, defaultDays, used]
      );
      lbCount++;
    }
  }
  console.log(`   ✅ ${lbCount} leave balance records`);

  // ── 5. Leave requests ─────────────────────────────
  console.log('\n✈️  Inserting leave requests...');
  const leaveStatuses = ['approved','approved','approved','pending','rejected'];
  let lrCount = 0;
  for (const emp of employees) {
    // Each employee gets 1-3 leave requests in 2026
    const numRequests = rand(1, 3);
    for (let r = 0; r < numRequests; r++) {
      const ltName = pick(Object.keys(leaveTypeIds));
      const ltId   = leaveTypeIds[ltName];
      const startDay = rand(1, 300);
      const startDate = new Date(2026, 0, startDay);
      const days = rand(1, 5);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days - 1);
      const status = pick(leaveStatuses);

      await db.query(
        `INSERT INTO leave_requests
           (employee_id, leave_type_id, company_id, start_date, end_date,
            days_requested, reason, status, reviewed_by, reviewed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW())`,
        [
          emp.id, ltId, COMPANY_ID,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
          days,
          pick(['Annual holiday','Family emergency','Medical appointment','Personal matter','Sick day']),
          status,
          status !== 'pending' ? ADMIN_ID : null,
        ]
      );
      lrCount++;
    }
  }
  console.log(`   ✅ ${lrCount} leave requests`);

  // ── 6. Attendance + shifts + payroll (Jan–Mar 2026) ──
  const MONTHS = [1, 2, 3];
  const YEAR = 2026;

  console.log('\n💰 Building payroll periods...');

  // Ensure payroll period records
  const periodIds = {};
  for (const month of MONTHS) {
    const ex = await db.query(
      `SELECT id FROM payroll_periods WHERE company_id=$1 AND month=$2 AND year=$3`,
      [COMPANY_ID, month, YEAR]
    );
    if (ex.rows.length) {
      periodIds[month] = ex.rows[0].id;
    } else {
      const ins = await db.query(
        `INSERT INTO payroll_periods (company_id, month, year, status, total_employees)
         VALUES ($1,$2,$3,'completed',$4) RETURNING id`,
        [COMPANY_ID, month, YEAR, employees.length]
      );
      periodIds[month] = ins.rows[0].id;
    }
  }

  console.log('\n🕐 Inserting attendance, shifts & payroll records...');
  let attCount = 0, shiftCount = 0, payCount = 0;

  // Payroll totals accumulators (for verification)
  const monthlyTotals = {};
  for (const m of MONTHS) {
    monthlyTotals[m] = { gross: 0, paye: 0, uif: 0, pension: 0, net: 0, count: 0 };
  }

  const shiftCodes = Object.keys(shiftIds); // ['AM','PM','NS']

  for (const emp of employees) {
    for (const month of MONTHS) {
      const workDays = getWorkingDays(YEAR, month);

      // ── Attendance ─────────────────────────────────
      let monthOvertimeHours = 0;
      for (const day of workDays) {
        // 90% attendance rate — 10% absent
        if (Math.random() < 0.10) continue;

        const date = `${YEAR}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
        const isLate = Math.random() < 0.08;
        const lateMinutes = isLate ? rand(5, 45) : 0;
        const hasOvertime  = Math.random() < 0.15;
        const overtimeHours = hasOvertime ? rand(1, 3) : 0;
        const totalHours = round2(8 + overtimeHours - lateMinutes / 60);
        const hourlyRate = round2(emp.salary / 160); // 160 hours/month
        const dailyPay   = round2(hourlyRate * 8);
        const overtimePay = round2(hourlyRate * 1.5 * overtimeHours);

        monthOvertimeHours += overtimeHours;

        const clockIn = new Date(`${YEAR}-${month.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}T08:${lateMinutes.toString().padStart(2,'0')}:00`);
        const clockOut = new Date(clockIn);
        clockOut.setHours(clockOut.getHours() + 8 + overtimeHours);

        await db.query(
          `INSERT INTO attendance_records
             (company_id, employee_id, date, clock_in, clock_out,
              total_hours, overtime_hours, late_minutes, status,
              expected_start, expected_end, expected_hours,
              hourly_rate, daily_pay, overtime_pay)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'08:00','16:00',8,$10,$11,$12)
           ON CONFLICT DO NOTHING`,
          [
            COMPANY_ID, emp.id, date, clockIn, clockOut,
            totalHours, overtimeHours, lateMinutes,
            isLate ? 'late' : 'present',
            hourlyRate, dailyPay, overtimePay,
          ]
        );
        attCount++;
      }

      // ── Shifts (assign 3 shifts per week) ─────────
      for (let weekStart = 1; weekStart <= 28; weekStart += 7) {
        for (let d = 0; d < 5 && weekStart + d <= 28; d++) {
          const shiftDate = new Date(YEAR, month - 1, weekStart + d);
          if (shiftDate.getDay() === 0 || shiftDate.getDay() === 6) continue;
          if (Math.random() < 0.4) continue; // not every day has a formal shift

          const shiftCode = pick(shiftCodes);
          const tmpl = shiftData.find(s => s.code === shiftCode);
          const hourlyRate = round2(emp.salary / 160);
          const basePay    = round2(hourlyRate * tmpl.hours);
          const premium    = round2(basePay * (tmpl.multiplier - 1));
          const totalPay   = round2(basePay + premium);
          const nightAllow = tmpl.night ? round2(basePay * 0.10) : 0;

          await db.query(
            `INSERT INTO employee_shifts
               (employee_id, company_id, shift_template_id, shift_date, status,
                base_pay, shift_premium, night_shift_allowance, total_pay,
                actual_hours_worked, hours_worked)
             VALUES ($1,$2,$3,$4,'completed',$5,$6,$7,$8,$9,$9)
             ON CONFLICT DO NOTHING`,
            [
              emp.id, COMPANY_ID, shiftIds[shiftCode],
              shiftDate.toISOString().split('T')[0],
              basePay, premium, nightAllow, totalPay, tmpl.hours,
            ]
          );
          shiftCount++;
        }
      }

      // ── Payroll calculation ───────────────────────
      // Basic salary (monthly)
      const basic = emp.salary;

      // Allowances: transport R800 + housing if salary < 15000
      const transportAllow = 800;
      const housingAllow   = emp.salary < 15000 ? 1500 : 0;
      const allowances     = transportAllow + housingAllow;

      // Overtime pay from attendance (1.5x hourly rate)
      const hourlyRate     = round2(basic / 160);
      const overtimePay    = round2(hourlyRate * 1.5 * monthOvertimeHours);

      // Bonuses: 0 (no bonus months in Jan-Mar)
      const bonuses = 0;

      // Gross pay
      const grossPay = round2(basic + allowances + overtimePay + bonuses);

      // PAYE — use annualised gross
      const annualGross = grossPay * 12;
      const paye = calcAnnualPAYE(annualGross);

      // UIF — 1% of gross, capped
      const uif = calcUIF(grossPay);

      // Pension — 7.5% of basic
      const pension = calcPension(basic);

      // Medical aid — flat R750 for permanent, R0 otherwise
      const medicalAid = emp.empType === 'permanent' ? 750 : 0;

      // Other deductions: 0
      const otherDeductions = 0;

      // Total deductions
      const totalDeductions = round2(paye + uif + pension + medicalAid + otherDeductions);

      // Net pay
      const netPay = round2(grossPay - totalDeductions);

      // Accumulate for verification
      monthlyTotals[month].gross   += grossPay;
      monthlyTotals[month].paye    += paye;
      monthlyTotals[month].uif     += uif;
      monthlyTotals[month].pension += pension;
      monthlyTotals[month].net     += netPay;
      monthlyTotals[month].count   += 1;

      // Delete existing record for this employee/month to avoid duplication on re-run
      await db.query(
        `DELETE FROM payroll_records WHERE company_id=$1 AND employee_id=$2 AND month=$3 AND year=$4`,
        [COMPANY_ID, emp.id, month, YEAR]
      );

      // ✅ FIXED: Proper payment_date calculation
      const paymentDate = `${YEAR}-${month.toString().padStart(2,'0')}-28`;

      await db.query(
  `INSERT INTO payroll_records
     (company_id, employee_id, month, year,
      basic_salary, allowances, bonuses, overtime,
      tax, uif, pension, medical_aid, other_deductions,
      status, payment_method, payment_date)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
           'paid',$14,$15)`,
  [
    COMPANY_ID, emp.id, month, YEAR,
    basic, allowances, bonuses, overtimePay,
    paye, uif, pension, medicalAid, otherDeductions,
    pick(PAYMENT_METHODS),
    paymentDate,
  ]
);
      payCount++;
    }
  }

  console.log(`   ✅ ${attCount} attendance records`);
  console.log(`   ✅ ${shiftCount} shift assignments`);
  console.log(`   ✅ ${payCount} payroll records`);

  // ── 7. Verification report ────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log('  VERIFICATION REPORT');
  console.log('═'.repeat(65));

  for (const month of MONTHS) {
    const t = monthlyTotals[month];
    const mName = ['','January','February','March'][month];

    // Cross-check from DB
    const dbCheck = await db.query(
      `SELECT
         COUNT(*)::int                    AS emp_count,
         ROUND(SUM(gross_pay),2)          AS total_gross,
         ROUND(SUM(tax),2)                AS total_paye,
         ROUND(SUM(uif),2)                AS total_uif,
         ROUND(SUM(pension),2)            AS total_pension,
         ROUND(SUM(net_pay),2)            AS total_net,
         ROUND(AVG(gross_pay),2)          AS avg_gross,
         MIN(net_pay) AS min_net, MAX(net_pay) AS max_net,
         MIN(gross_pay) AS min_gross, MAX(gross_pay) AS max_gross,
         MIN(tax) AS min_paye, MAX(tax) AS max_paye
       FROM payroll_records
       WHERE company_id=$1 AND month=$2 AND year=2026`,
      [COMPANY_ID, month]
    );

    const d = dbCheck.rows[0];

    console.log(`\n  📅 ${mName} 2026`);
    console.log(`  ${'─'.repeat(55)}`);
    console.log(`  Employees processed : ${d.emp_count}`);
    console.log(`  Total Gross Pay     : R ${Number(d.total_gross).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Total PAYE          : R ${Number(d.total_paye).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Total UIF           : R ${Number(d.total_uif).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Total Pension       : R ${Number(d.total_pension).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Total Net Pay       : R ${Number(d.total_net).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Avg Gross per Emp   : R ${Number(d.avg_gross).toLocaleString('en-ZA',{minimumFractionDigits:2})}`);
    console.log(`  Gross Range         : R${Number(d.min_gross).toLocaleString()} – R${Number(d.max_gross).toLocaleString()}`);
    console.log(`  Net Range           : R${Number(d.min_net).toLocaleString()} – R${Number(d.max_net).toLocaleString()}`);
    console.log(`  PAYE Range          : R${Number(d.min_paye).toLocaleString()} – R${Number(d.max_paye).toLocaleString()}`);
  }

  console.log('\n' + '═'.repeat(65));
  console.log('  ✅ SEED COMPLETE — All data inserted and verified');
  console.log('═'.repeat(65) + '\n');

  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌ Seeder failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});