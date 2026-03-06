// File: src/routes/leave.routes.js
const express = require("express");
const router = express.Router();
const leaveController = require("../controllers/leave.controller");
const analyticsController = require("../controllers/analytics.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Roles that can manage/approve leave
const canManage = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "hr_manager",
  "front_office_manager",
  "supervisor",
];

router.get("/types", requireAuth, leaveController.getLeaveTypes);
router.get("/balances", requireAuth, leaveController.getMyBalances);
router.get(
  "/balances/:employeeId",
  requireAuth,
  requireRoles(...canManage),
  leaveController.getEmployeeBalances
);

router.get("/requests/my", requireAuth, leaveController.getMyRequests);
router.get(
  "/requests",
  requireAuth,
  requireRoles(...canManage),
  leaveController.getAllRequests
);
router.get("/requests/:id", requireAuth, leaveController.getRequestById);
router.post("/requests", requireAuth, leaveController.createRequest);
router.patch(
  "/requests/:id/cancel",
  requireAuth,
  leaveController.cancelRequest
);
router.patch(
  "/requests/:id/approve",
  requireAuth,
  requireRoles(...canManage),
  leaveController.approveRequest
);
router.patch(
  "/requests/:id/reject",
  requireAuth,
  requireRoles(...canManage),
  leaveController.rejectRequest
);
router.get(
  "/calendar",
  requireAuth,
  requireRoles(...canManage),
  leaveController.getLeaveCalendar
);
router.get(
  "/team",
  requireAuth,
  requireRoles(...canManage),
  leaveController.getTeamLeaves
);
router.get(
  "/analytics",
  requireAuth,
  requireRoles("owner", "admin", "general_manager", "manager", "hr_manager"),
  analyticsController.getLeaveAnalytics
);

module.exports = router;
