// File: src/routes/attendance.routes.js
const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendance.controller");
const { requireAuth, requireRoles } = require("../middleware");

// ===== SELF-SERVICE (any authenticated user) =====
// Get own today's status
router.get("/today", requireAuth, attendanceController.getTodayStatus);

// Clock in (self or admin on behalf of employee)
router.post("/clock-in", requireAuth, attendanceController.clockIn);

// Start break
router.post("/break-start", requireAuth, attendanceController.startBreak);

// End break
router.post("/break-end", requireAuth, attendanceController.endBreak);

// Clock out
router.post("/clock-out", requireAuth, attendanceController.clockOut);

// ===== ADMIN / MANAGER ONLY =====
// Get all attendance records (with filters)
router.get(
  "/records",
  requireAuth,
  requireRoles("admin", "manager"),
  attendanceController.getAttendanceRecords
);

// Get today's summary stats
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  attendanceController.getAttendanceSummary
);

// Get monthly report (feeds into payroll)
router.get(
  "/monthly-report",
  requireAuth,
  requireRoles("admin", "manager"),
  attendanceController.getMonthlyReport
);

// Admin override - manually set attendance
router.post(
  "/override",
  requireAuth,
  requireRoles("admin", "manager"),
  attendanceController.adminOverride
);

module.exports = router;
