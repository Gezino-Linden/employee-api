// File: src/routes/leave.routes.js
const express = require("express");
const router = express.Router();
const leaveController = require("../controllers/leave.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Leave Management Routes
 * - Employees can: view their own requests, create requests, cancel pending requests
 * - Managers: view team requests, approve/reject
 * - Admins: full access
 */

// ===== LEAVE TYPES =====
router.get("/types", requireAuth, leaveController.getLeaveTypes);

// ===== LEAVE BALANCES =====
router.get("/balances", requireAuth, leaveController.getMyBalances);

router.get(
  "/balances/:employeeId",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.getEmployeeBalances
);

// ===== LEAVE REQUESTS =====

// Get my leave requests
router.get("/requests/my", requireAuth, leaveController.getMyRequests);

// Get all requests (admin/manager only)
router.get(
  "/requests",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.getAllRequests
);

// Get specific request
router.get("/requests/:id", requireAuth, leaveController.getRequestById);

// Create new leave request
router.post("/requests", requireAuth, leaveController.createRequest);

// Cancel own request (only pending)
router.patch(
  "/requests/:id/cancel",
  requireAuth,
  leaveController.cancelRequest
);

// Approve request (admin/manager only)
router.patch(
  "/requests/:id/approve",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.approveRequest
);

// Reject request (admin/manager only)
router.patch(
  "/requests/:id/reject",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.rejectRequest
);

// Get leave calendar (all approved leaves)
router.get(
  "/calendar",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.getLeaveCalendar
);

// Get team leaves (manager view)
router.get(
  "/team",
  requireAuth,
  requireRoles("admin", "manager"),
  leaveController.getTeamLeaves
);
// ===== ANALYTICS =====
router.get(
  "/analytics",
  requireAuth,
  requireRoles("admin", "manager"),
  require("../controllers/analytics.controller").getLeaveAnalytics
);

module.exports = router;
