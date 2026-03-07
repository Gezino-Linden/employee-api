// File: src/routes/employee-portal.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/employee-portal.controller");
const { requireEmployee } = require("../middleware/employeeAuth");

// ── Attendance ────────────────────────────────────────────────────────────────
router.get("/attendance/today", requireEmployee, c.getTodayStatus);
router.post("/attendance/clock-in", requireEmployee, c.clockIn);
router.post("/attendance/clock-out", requireEmployee, c.clockOut);
router.post("/attendance/break-start", requireEmployee, c.startBreak);
router.post("/attendance/break-end", requireEmployee, c.endBreak);

// ── Leave ─────────────────────────────────────────────────────────────────────
router.get("/leave/balances", requireEmployee, c.getLeaveBalances);
router.get("/leave/types", requireEmployee, c.getLeaveTypes);
router.get("/leave/requests/my", requireEmployee, c.getMyLeaveRequests);
router.post("/leave/requests", requireEmployee, c.submitLeaveRequest);
router.patch(
  "/leave/requests/:id/cancel",
  requireEmployee,
  c.cancelLeaveRequest
);

// ── Shifts ────────────────────────────────────────────────────────────────────
router.get("/shifts", requireEmployee, c.getMyShifts);

// ── Payslips ──────────────────────────────────────────────────────────────────
router.get("/payslips", requireEmployee, c.getMyPayslips);

module.exports = router;
