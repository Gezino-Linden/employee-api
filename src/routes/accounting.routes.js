// File: src/routes/accounting.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/accounting.controller");
const { requireAuth, requireRoles } = require("../middleware");

const canView = ["owner", "admin", "general_manager", "manager", "accountant"];
const canManage = [
  "owner",
  "admin",
  "general_manager",
  "manager",
  "accountant",
];

router.get("/accounts", requireAuth, requireRoles(...canView), c.getAccounts);
router.get("/periods", requireAuth, requireRoles(...canView), c.getPeriods);
router.get("/mappings", requireAuth, requireRoles(...canView), c.getMappings);
router.get(
  "/vat/transactions",
  requireAuth,
  requireRoles(...canManage),
  c.getVATTransactions
);
router.get(
  "/vat/return",
  requireAuth,
  requireRoles(...canManage),
  c.getVATReturn
);
router.get("/pl", requireAuth, requireRoles(...canManage), c.getPL);
router.post(
  "/journal/generate",
  requireAuth,
  requireRoles(...canManage),
  c.generateJournal
);
router.get(
  "/export/csv",
  requireAuth,
  requireRoles(...canManage),
  c.exportJournal
);
router.post(
  "/period/close",
  requireAuth,
  requireRoles(...canManage),
  c.closePeriod
);
router.get(
  "/period/close",
  requireAuth,
  requireRoles(...canManage),
  c.getPeriodStatus
);

module.exports = router;
