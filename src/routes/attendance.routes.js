// File: src/routes/attendance.routes.js
const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendance.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Roles that can view/manage attendance records
const canManage = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "hr_manager",
  "front_office_manager",
  "supervisor",
];

// Self-service — any authenticated user
router.get("/today", requireAuth, attendanceController.getTodayStatus);
router.post("/clock-in", requireAuth, attendanceController.clockIn);
router.post("/break-start", requireAuth, attendanceController.startBreak);
router.post("/break-end", requireAuth, attendanceController.endBreak);
router.post("/clock-out", requireAuth, attendanceController.clockOut);

// Management
router.get(
  "/records",
  requireAuth,
  requireRoles(...canManage),
  attendanceController.getAttendanceRecords
);
router.get(
  "/summary",
  requireAuth,
  requireRoles(...canManage),
  attendanceController.getAttendanceSummary
);
router.get(
  "/monthly-report",
  requireAuth,
  requireRoles(...canManage),
  attendanceController.getMonthlyReport
);
router.post(
  "/override",
  requireAuth,
  requireRoles(
    "owner",
    "admin",
    "general_manager",
    "manager",
    "hr_manager",
    "front_office_manager"
  ),
  attendanceController.adminOverride
);

module.exports = router;
