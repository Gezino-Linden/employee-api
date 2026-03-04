# PeopleOS — HR & Payroll API

A production-grade REST API built with **Node.js (Express)** and **PostgreSQL** for the PeopleOS hotel HR & payroll management system.

---

## 🚀 Live API

**Base URL:** `https://employee-api-xpno.onrender.com/api`

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Excel Export | ExcelJS |
| CSV Export | json2csv |
| Dev | nodemon, dotenv |

---

## ✨ Feature Modules

### 🔐 Authentication
- `POST /auth/register` — Register company + admin user
- `POST /auth/login` — Login, returns JWT
- `GET /me` — Get current user profile

### 👥 Employees
- Full CRUD with soft delete and restore
- Salary history tracking
- ID number, tax number, employment type fields
- `GET /employees` — paginated, searchable, filterable
- `GET /employees/:id`
- `POST /employees`
- `PUT /employees/:id`
- `DELETE /employees/:id`
- `PATCH /employees/:id/restore`
- `PATCH /employees/:id/salary`
- `GET /employees/:id/salary-history`

### 🕐 Attendance
- Clock in / clock out with live timer
- Auto-calculates hours worked and overtime
- Admin override for corrections
- `POST /attendance/clock-in`
- `POST /attendance/clock-out`
- `GET /attendance/today`
- `GET /attendance/summary`
- `GET /attendance/records`
- `POST /attendance/admin/override`

### 📅 Shifts
- Shift template management (Morning / Evening / Night)
- Assign shifts to employees
- Weekly calendar view
- Shift swap requests with approval workflow
- Night pay, Sunday double pay, public holiday double pay
- Rate multipliers per shift type
- `GET /shifts/templates`
- `POST /shifts/templates`
- `PUT /shifts/templates/:id`
- `DELETE /shifts/templates/:id`
- `GET /shifts/assignments`
- `POST /shifts/assign`
- `GET /shifts/weekly`
- `GET /shifts/swaps`
- `POST /shifts/swaps`
- `PATCH /shifts/swaps/:id/approve`
- `PATCH /shifts/swaps/:id/reject`

### 🏖️ Leave
- Leave type management
- Leave request and approval workflow
- Leave balance tracking per employee
- Leave analytics
- `GET /leave/types`
- `POST /leave/types`
- `GET /leave/requests`
- `POST /leave/requests`
- `PATCH /leave/requests/:id/approve`
- `PATCH /leave/requests/:id/reject`
- `GET /leave/balances`
- `GET /leave/analytics`

### 💰 Payroll
- Monthly payroll period initialization
- Payroll processing with full integration:
  - Basic salary + allowances + bonuses
  - Attendance overtime auto-applied
  - Shift premiums + night pay auto-applied
  - Public holiday double pay
- PAYE tax calculation (2025/26 SARS brackets)
- UIF calculation (1% employee + 1% employer, R177.12 cap)
- SDL calculation (1% of gross)
- Pension fund deductions
- Mark as paid with payment method
- Payslip PDF generation
- Full audit log (old_values / new_values JSON)
- `GET /payroll/summary`
- `GET /payroll/records`
- `POST /payroll/initialize`
- `POST /payroll/process`
- `PATCH /payroll/:id/pay`
- `GET /payroll/:id/payslip`
- `GET /payroll/periods`
- `GET /payroll/history`

### 🏛️ SARS Compliance
- EMP201 monthly PAYE/SDL/UIF declarations
- UI-19 UIF declarations
- IRP5 tax certificate generation
- `GET /sars/emp201`
- `POST /sars/emp201/generate`
- `GET /sars/ui19`
- `POST /sars/ui19/generate`
- `GET /sars/irp5`
- `POST /sars/irp5/generate`

### 📊 Accounting
- Chart of accounts (31 accounts)
- Payroll journal entry generation (standard + hospitality)
- GL mapping configuration
- Invoicing with line items, VAT, payment recording
- Accounts Payable — suppliers and bills
- Daily revenue logging (rooms, F&B, other)
- P&L report
- VAT return calculation
- Period close (locks entries, snapshots financials, posts VAT to GL)
- `GET /accounting/accounts`
- `GET /accounting/periods`
- `POST /accounting/journal/generate`
- `GET /accounting/mappings`
- `GET /invoices`
- `POST /invoices`
- `POST /invoices/:id/payments`
- `GET /ap/suppliers`
- `POST /ap/suppliers`
- `GET /ap/bills`
- `POST /ap/bills`
- `PATCH /ap/bills/:id/pay`
- `GET /revenue`
- `POST /revenue`
- `GET /accounting/pl`
- `GET /accounting/vat/return`
- `POST /accounting/period/close`

### 📈 Analytics
- Dashboard KPI cards
- Payroll analytics (monthly trends, department breakdown)
- Leave analytics
- Attendance analytics
- SARS compliance status
- HR insights
- `GET /analytics/dashboard`
- `GET /analytics/payroll`
- `GET /analytics/leave`
- `GET /analytics/attendance`
- `GET /analytics/compliance`

### 📄 Reports — 13 Report Types
All reports available in **Excel (.xlsx)** and **PDF (print-ready HTML)** format.

| Report | Endpoint |
|---|---|
| Full HR Report | `GET /reports/export/excel` |
| Employee Register | `GET /reports/employees/export/excel` |
| Headcount by Department | `GET /reports/employees/headcount/export/excel` |
| Payroll Summary | `GET /reports/payroll/export/excel` |
| Payroll Detailed Breakdown | `GET /reports/payroll/detailed/export/excel` |
| Payroll Year-to-Date | `GET /reports/payroll/ytd/export/excel` |
| Monthly Attendance | `GET /reports/attendance/export/excel` |
| Attendance by Date Range | `GET /reports/attendance/range/export/excel` |
| Overtime Report | `GET /reports/attendance/overtime/export/excel` |
| Leave Balances | `GET /reports/leave/balances/export/excel` |
| Leave Taken | `GET /reports/leave/taken/export/excel` |
| EMP201 PAYE Report | `GET /reports/sars/emp201/export/excel` |
| Tax Liability Summary | `GET /reports/sars/liability/export/excel` |

Replace `/excel` with `/pdf` for PDF versions.

Preview endpoint: `GET /reports/preview?year=2026&month=3`

---

## 🗄️ Database Schema (Key Tables)

```
companies               — Multi-tenant company accounts
users                   — Auth users with roles (admin/manager/employee)
employees               — Employee records with full HR fields
salary_history          — Tracks all salary changes
attendance_records      — Clock in/out, hours, overtime
shift_templates         — Shift type definitions with pay rates
employee_shifts         — Shift assignments per employee per day
leave_types             — Configurable leave types
leave_requests          — Leave requests and approval status
leave_balances          — Current leave balance per employee per type
payroll_records         — Monthly payroll per employee
payroll_audit_log       — Full audit trail with old/new values
emp201_declarations     — Monthly SARS PAYE/SDL/UIF declarations
ui19_declarations       — Monthly UIF UI-19 declarations
irp5_certificates       — Annual employee tax certificates
accounts                — Chart of accounts (31 default accounts)
journal_entries         — GL journal entries
gl_mappings             — Payroll-to-GL account mappings
invoices                — Customer invoices with line items
invoice_payments        — Invoice payment records
suppliers               — Accounts payable suppliers
ap_bills                — Supplier bills
daily_revenue           — Hotel daily revenue by department
accounting_periods      — Closed financial periods
public_holidays         — SA public holidays (queried at runtime)
```

---

## ⚙️ Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Create a `.env` file:
```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
JWT_SECRET=your_jwt_secret_here
PORT=3000
```

### 3. Run database migrations
```bash
# Run all migration SQL files in order
psql $DATABASE_URL -f migrations/001_initial.sql
# etc.
```

### 4. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

---

## 🔒 Authentication

All protected routes require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

### Roles
| Role | Access |
|---|---|
| `admin` | Full access to all endpoints |
| `manager` | Read + process payroll, approve leave/shifts |
| `employee` | Own attendance, own leave requests, own payslips |

---

## 📦 Key Business Logic

### Payroll Processing
When `POST /payroll/process` is called:
1. Loads employee base salary, allowances, bonuses
2. Queries `attendance_records` for overtime hours → calculates overtime pay
3. Queries `employee_shifts` for the month → calculates night pay + shift premiums + Sunday/public holiday double pay
4. Calculates PAYE using 2025/26 SARS tax tables
5. Calculates UIF (1% employee, capped at R177.12)
6. Calculates SDL (1% employer)
7. Writes to `payroll_records`
8. Writes full audit log with old/new values

### Public Holidays
Checked against the `public_holidays` database table (not hardcoded). SA 2026 holidays pre-loaded.

### Multi-tenancy
All queries are scoped by `company_id` from the JWT token. No cross-company data leakage.

---

## 👤 Author

**Gezino Linden**
- GitHub: [@Gezino-Linden](https://github.com/Gezino-Linden)

---

## 📄 License

This project is part of the PeopleOS full-stack HR management system.