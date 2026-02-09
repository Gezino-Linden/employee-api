# Employee API (Express + PostgreSQL)

A simple REST API built with **Node.js (Express)** and **PostgreSQL** featuring:
- JWT authentication (register/login)
- Role-based access control (admin vs user)
- Protected routes
- Users CRUD
- Pagination + search on users endpoint

### Employees (admin only, requires Bearer token)
- GET /employees?page=1&limit=10&search=john
- GET /employees/:id
- POST /employees
- PUT /employees/:id
- DELETE /employees/:id


## Tech Stack
- Node.js + Express
- PostgreSQL
- bcrypt (password hashing)
- jsonwebtoken (JWT)
- nodemon (dev)
- dotenv (env vars)

## Setup

### 1 Install dependencies
```bash
npm install
