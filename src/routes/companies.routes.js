const express = require("express");
const router = express.Router();

const companiesController = require("../controllers/companies.controller");
const invitesController = require("../controllers/invites.controller");
const { requireAuth, requireRoles } = require("../middleware");

/**
 * Companies:
 * - Admin can create company
 * - Admin can invite users to THEIR company
 * - All logged users can view their company
 */

//////////////////////////////
// CREATE COMPANY (admin)
//////////////////////////////
router.post(
  "/",
  requireAuth,
  requireRoles("admin"),
  companiesController.createCompany
);

//////////////////////////////
// GET MY COMPANY
//////////////////////////////
router.get(
  "/me",
  requireAuth,
  requireRoles("admin", "manager", "user"),
  companiesController.getMyCompany
);

//////////////////////////////
// 🔥 INVITE USER TO COMPANY (admin)
//////////////////////////////
router.post(
  "/invite",
  requireAuth,
  requireRoles("admin"),
  invitesController.createInvite
);

module.exports = router;
