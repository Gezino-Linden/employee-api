const express = require("express");
const router = express.Router();

const companiesController = require("../controllers/companies.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Companies:
 * - For now: only admins can create companies.
 * - You can later add "platform admin" if you want only 1 super-admin to create companies.
 */

// Create a new company (admin only)
router.post(
  "/",
  requireAuth,
  requireRoles("admin"),
  companiesController.createCompany
);

// Get my company details (admin/manager/user)
router.get(
  "/me",
  requireAuth,
  requireRoles("admin", "manager", "user"),
  companiesController.getMyCompany
);

module.exports = router;
