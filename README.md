# MaeRoll — Employee API (Node.js + Express + PostgreSQL)

> **Full-stack SaaS HR, Payroll & Accounting backend** for the hospitality industry.
> Built with Node.js, Express, and PostgreSQL. Deployed on Render.

---

## 🔗 Links

|                   |                                                    |
| ----------------- | -------------------------------------------------- |
| **Live API**      | https://employee-api-xpno.onrender.com             |
| **Frontend Repo** | https://github.com/Gezino-Linden/employee-frontend |
| **Live App**      | https://gentle-kulfi-c11ec3.netlify.app            |

---

## 🛠 Tech Stack

| Layer     | Technology                       |
| --------- | -------------------------------- |
| Runtime   | Node.js 18+                      |
| Framework | Express.js                       |
| Database  | PostgreSQL (Render managed)      |
| Auth      | JWT (jsonwebtoken) + bcrypt      |
| Security  | express-rate-limit, CORS, helmet |
| Config    | dotenv                           |
| Dev       | nodemon                          |

---

## 📁 Project Structure

```
src/
├── controllers/
│   ├── auth.controller.js          # Register, login, JWT issue
│   ├── employees.controller.js     # Employee CRUD, salary history
│   ├── attendance.controller.js    # Clock in/out, monthly reports
│   ├── shifts.controller.js        # Templates, assignments, swaps
│   ├── leave.controller.js         # Requests, approvals, balances
│   ├── payroll.controller.js       # Processing, payslips, history
│   ├── sars.controller.js          # EMP201, UI-19, IRP5
│   ├── invoices.controller.js      # AR invoices + AR ageing (14 buckets)
│   ├── ap.controller.js            # AP suppliers, bills + AP ageing (14 buckets)
│   ├── accounting.controller.js    # Chart of accounts, journals, GL mappings
│   ├── revenue.controller.js       # Daily hotel revenue
│   ├── analytics.controller.js     # Payroll, leave, attendance analytics
│   ├── reports.controller.js       # 13 exportable report types
│   ├── portal.controller.js        # Employee self-service portal
│   └── license.controller.js       # SaaS licensing & plan gating
├── routes/
│   ├── auth.routes.js
│   ├── employees.routes.js
│   ├── attendance.routes.js
│   ├── shifts.routes.js
│   ├── leave.routes.js
│   ├── payroll.routes.js
│   ├── sars.routes.js
│   ├── invoices.routes.js
│   ├── ap.routes.js
│   ├── accounting.routes.js
│   ├── revenue.routes.js
│   ├── analytics.routes.js
│   ├── reports.routes.js
│   ├── portal.routes.js
│   └── license.routes.js
├── middleware/
│   ├── auth.middleware.js          # JWT verify, role check
│   └── rateLimiter.js              # Per-route rate limiting
migrations/
server.js
```

---

## 🔐 Auth & Security

- JWT tokens issued on login, verified on every protected route
- Passwords hashed with **bcrypt** (salt rounds: 10)
- **Rate limiter** on auth endpoints — 5 login attempts per 15 min per IP
- Role-based access: `admin`, `manager`, `employee`
- Multi-tenant: every query is scoped to `company_id`
- CORS configured for Netlify frontend origin

---

## 📋 API Modules

### 🔑 Auth (`/api/auth`)

| Method | Endpoint        | Description                             |
| ------ | --------------- | --------------------------------------- |
| POST   | `/register`     | Register new company + admin user       |
| POST   | `/login`        | Login, returns JWT                      |
| POST   | `/portal/login` | Employee portal login (PIN or password) |

### 👥 Employees (`/api/employees`)

- Full CRUD with pagination and search
- Salary update with full history log
- Employment type, ID, tax number, department, position
- Deactivate / restore employees

### 🕐 Attendance (`/api/attendance`)

- Clock in / clock out with timestamp
- Today's status per employee
- Monthly report with total hours and overtime
- Admin override for corrections

### 📅 Shifts (`/api/shifts`)

- Shift templates (Morning / Evening / Night) with pay rates and multipliers
- Assign employees to shifts by date
- Shift swap requests with manager approval workflow

### 🏖️ Leave (`/api/leave`)

- Submit and manage leave requests
- Manager approval / rejection workflow
- Leave balance tracking per type (Annual, Sick, Family, Study, Unpaid)
- Leave analytics

### 💰 Payroll (`/api/payroll`)

- Initialize payroll period
- Process payroll per employee (PAYE, SDL, UIF, net pay)
- Payslip PDF generation
- Mark period as paid with payment method
- Full payroll history

### 🏛️ SARS Compliance (`/api/sars`)

- **EMP201** — monthly PAYE/SDL/UIF declaration generation
- **UI-19** — monthly UIF submissions
- **IRP5** — annual IT3(a) tax certificate generation

### 📊 Accounting — AR (`/api/invoices`)

| Method | Endpoint       | Description                                          |
| ------ | -------------- | ---------------------------------------------------- |
| GET    | `/`            | List all AR invoices                                 |
| POST   | `/`            | Create guest invoice                                 |
| PUT    | `/:id/payment` | Record payment                                       |
| GET    | `/ageing`      | **14-bucket AR ageing report with running balances** |

### 📊 Accounting — AP (`/api/ap`)

| Method | Endpoint     | Description                                          |
| ------ | ------------ | ---------------------------------------------------- |
| GET    | `/suppliers` | List suppliers                                       |
| POST   | `/suppliers` | Create supplier                                      |
| GET    | `/invoices`  | List AP bills                                        |
| POST   | `/invoices`  | Create AP bill                                       |
| GET    | `/ageing`    | **14-bucket AP ageing report with running balances** |

### 📈 Revenue (`/api/revenue`)

- Log daily hotel revenue by department (Rooms, F&B, Conferencing, Spa, Other)
- Monthly revenue summaries

### 📉 Analytics (`/api/analytics`)

- Payroll trends, department breakdown
- Leave analytics by type and department
- Attendance punctuality and hours trends
- SARS compliance status
- HR insights: headcount, turnover, salary analytics

### 📄 Reports (`/api/reports`)

13 report types with full data export:

- Full HR Report, Employee Register, Headcount by Department
- Payroll Summary, Detailed Payroll Breakdown, Year-to-Date Payroll
- Monthly Attendance, Date Range Attendance, Overtime Report
- Leave Balances, Leave Taken
- EMP201 PAYE, Tax Liability Summary

### 🔑 Licensing (`/api/license`)

- Validate license keys per company
- Plan gating: Starter / Professional / Enterprise
- Feature flags per plan tier

### 👤 Employee Portal (`/api/portal`)

- Employee self-service: view payslips, leave balances, attendance
- PIN or password login (separate from admin login)

---

## 🗄️ Database Schema (Key Tables)

```sql
companies              -- Multi-tenant root (company_id on every table)
users                  -- Admin/manager/employee accounts
employees              -- Employee records (personal, employment, salary)
attendance             -- Clock in/out records
shift_templates        -- Shift type definitions
shift_assignments      -- Employee ↔ shift ↔ date mappings
shift_swap_requests    -- Swap workflow
leave_requests         -- Leave with approval status
leave_balances         -- Per-employee leave balances
payroll_periods        -- Payroll run records
payroll_records        -- Per-employee payroll line items
sars_emp201            -- Monthly PAYE declarations
sars_ui19              -- UIF submissions
sars_irp5              -- Annual IRP5 certificates
invoices               -- AR guest invoices
ap_suppliers           -- Accounts payable suppliers
ap_invoices            -- AP bills/invoices
chart_of_accounts      -- 31-account COA
journal_entries        -- Payroll GL journal entries
revenue_entries        -- Daily hotel revenue
opening_balances       -- Customer/supplier brought-forward balances
license_keys           -- SaaS license key validation
```

---

## 📊 AR/AP Ageing — 14-Bucket Model

The ageing engine uses **due-date-based bucketing** with **running balances** (oldest → newest), matching standard accounting procedure logic.

### Buckets

| Bucket  | Days Overdue |
| ------- | ------------ |
| Current | Not yet due  |
| 1–30    | 1–30 days    |
| 31–60   | 31–60 days   |
| 61–90   | 61–90 days   |
| 90–120  | 90–120 days  |
| 120–150 | 120–150 days |
| 150–180 | 150–180 days |
| 180–210 | 180–210 days |
| 210–240 | 210–240 days |
| 240–270 | 240–270 days |
| 270–300 | 270–300 days |
| 300–330 | 300–330 days |
| 330–360 | 330–360 days |
| 360+    | 360+ days    |

### Running Balance Logic

```
bal_360plus  = opening_balance + days_360_plus
bal_330_360  = bal_360plus     + days_330_360
bal_300_330  = bal_330_360     + days_300_330
  ... (each bucket adds to the previous)
bal_current  = bal_1_30        + current_due

total_outstanding = all_invoice_balances + opening_balance
```

### Collection Alert Threshold

Alerts trigger at **61+ days overdue** (industry standard for hospitality).

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone https://github.com/Gezino-Linden/employee-api
cd employee-api
npm install
```

### Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=your_jwt_secret_here
PORT=3000
NODE_ENV=development
```

### Run locally

```bash
npm run dev      # nodemon (hot reload)
npm start        # production
```

---

## 🌐 Deployment

Hosted on **Render** (free tier).

> ⚠️ Free tier spins down after 15 minutes of inactivity — first request after sleep takes ~30 seconds.
> The rate limiter resets on server restart (in-memory store). If login is blocked, redeploy to clear.

---

## 👤 Author

**Gezino Linden** — [@Gezino-Linden](https://github.com/Gezino-Linden)

---

## 📄 License

Part of the **MaeRoll** full-stack SaaS HR & Accounting system for the hospitality industry.
