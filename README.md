# MaeRoll — Employee API (Node.js + Express + PostgreSQL)

> **Full-stack SaaS HR, Payroll & Accounting backend** for the hospitality industry.
> Built with Node.js, Express, and PostgreSQL. Deployed on Render.

---

## 🔗 Links

|                   |                                                              |
| ----------------- | ------------------------------------------------------------ |
| **Live API**      | https://employee-api-xpno.onrender.com                       |
| **Frontend Repo** | https://github.com/Gezino-Linden/employee-frontend           |
| **Live App**      | https://employee-frontend-dyl.pages.dev                      |
| **API Docs**      | https://employee-api-xpno.onrender.com/api-docs              |
| **Error Monitoring** | Sentry (maeroll.sentry.io)                                |

---

## 🛠 Tech Stack

| Layer        | Technology                              |
| ------------ | --------------------------------------- |
| Runtime      | Node.js 22+                             |
| Framework    | Express.js                              |
| Database     | PostgreSQL (Render managed)             |
| Auth         | JWT (jsonwebtoken) + bcrypt + Refresh Tokens |
| Security     | express-rate-limit, CORS, helmet        |
| Logging      | Winston (rotation, request ID tracing)  |
| Monitoring   | Sentry (@sentry/node)                   |
| Config       | dotenv                                  |
| Dev          | nodemon                                 |
| CI/CD        | GitHub Actions                          |

---

## 🔐 Auth & Security

- JWT access tokens (8h expiry) + refresh tokens (30 days) stored in PostgreSQL
- Passwords hashed with **bcrypt** (salt rounds: 10)
- **Rate limiter** on auth endpoints — 5 login attempts per 15 min per IP
- Role-based access: `admin`, `manager`, `employee`
- Multi-tenant: every query is scoped to `company_id`
- CORS configured via `ALLOWED_ORIGINS` environment variable
- Request ID tracing (`X-Request-ID` header on every response)
- Sentry error monitoring with full stack traces in production

---

## 📋 API Modules

### 🔒 Auth (`/api/auth`)

| Method | Endpoint          | Description                             |
| ------ | ----------------- | --------------------------------------- |
| POST   | `/register`       | Register new company + admin user       |
| POST   | `/login`          | Login, returns JWT + refresh token      |
| POST   | `/refresh`        | Exchange refresh token for new JWT      |
| POST   | `/forgot-password`| Send password reset email               |
| POST   | `/reset-password` | Reset password with token               |

### 👥 Employees (`/api/employees`)

- Full CRUD with pagination and search
- Salary update with full history log
- Soft delete with `deleted_at` timestamp
- Audit logging for all updates and deletes
- Employment type, ID, tax number, department, position

### 🕐 Attendance (`/api/attendance`)
- Clock in / clock out with timestamp
- Monthly report with total hours and overtime
- Admin override for corrections

### 📅 Shifts (`/api/shifts`)
- Shift templates with pay rates and multipliers
- Assign employees to shifts by date
- Shift swap requests with manager approval workflow

### 🏖️ Leave (`/api/leave`)
- Submit and manage leave requests
- Manager approval / rejection workflow
- Leave balance tracking per type
- Leave analytics

### 💰 Payroll (`/api/payroll`)
- Initialize payroll period
- Process payroll per employee (PAYE, SDL, UIF, net pay)
- Payslip PDF generation
- Mark period as paid with payment method
- Full payroll history with audit log

### 🏛️ SARS Compliance (`/api/sars`)
- **EMP201** — monthly PAYE/SDL/UIF declaration generation
- **UI-19** — monthly UIF submissions
- **IRP5** — annual IT3(a) tax certificate generation

### 📊 Accounting — AR (`/api/invoices`)
- AR invoices with line items and VAT
- 14-bucket ageing report with running balances

### 📊 Accounting — AP (`/api/ap`)
- Supplier management with bank details and payment terms
- AP bills with 14-bucket ageing report

### 📈 Revenue (`/api/revenue`)
- Daily hotel revenue by department
- Monthly revenue summaries

### 📉 Analytics (`/api/analytics`)
- Payroll, leave, attendance, compliance, HR insights
- Tips analytics with monthly breakdown

### 📄 Reports (`/api/reports`)
13 exportable report types covering HR, payroll, attendance, leave, and SARS.

### 🔑 Licensing (`/api/license`)
- License key validation per company
- Plan gating: Starter / Professional / Enterprise

### 👤 Employee Portal (`/api/portal`)
- Employee self-service: payslips, leave balances, attendance
- PIN or password login

---

## 🗄️ Database Schema (Key Tables)
```sql
companies              -- Multi-tenant root
users                  -- Admin/manager/employee accounts
employees              -- Employee records (soft delete with deleted_at)
refresh_tokens         -- JWT refresh token store (30 day expiry)
audit_logs             -- Full audit trail (who changed what, when, from where)
attendance_records     -- Clock in/out records
shift_templates        -- Shift type definitions
leave_requests         -- Leave with approval status
payroll_periods        -- Payroll run records
payroll_records        -- Per-employee payroll line items
payroll_audit_log      -- Payroll change history
sars_emp201            -- Monthly PAYE declarations
sars_ui19              -- UIF submissions
sars_irp5              -- Annual IRP5 certificates
invoices               -- AR guest invoices
ap_suppliers           -- Accounts payable suppliers
ap_invoices            -- AP bills
chart_of_accounts      -- 31-account COA
journal_entries        -- Payroll GL journal entries
revenue_entries        -- Daily hotel revenue
tip_pools              -- Tip pool management with company isolation
license_keys           -- SaaS license key validation
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
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
PORT=4000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:4200
```

### Run locally
```bash
npm run dev      # nodemon (hot reload)
npm start        # production
```

---

## 🌐 Deployment

Hosted on **Render** (free tier). Auto-deploys from `main` branch via GitHub Actions CI.

> ⚠️ Free tier spins down after 15 minutes of inactivity — first request after sleep takes ~50 seconds.
> The frontend error interceptor automatically retries failed requests up to 3 times.

### Render Environment Variables Required

| Key | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Strong random secret (88+ chars) |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs |

---

## 👤 Author

**Gezino Linden** — [@Gezino-Linden](https://github.com/Gezino-Linden)

---

## 📄 License

Part of the **MaeRoll** full-stack SaaS HR & Accounting system for the hospitality industry.
