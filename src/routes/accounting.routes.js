const express = require("express");
const router = express.Router();
const c = require("../controllers/accounting.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Chart of Accounts
router.get("/accounts", requireAuth, c.getAccounts);

// Payroll Periods
router.get("/periods", requireAuth, c.getPeriods);

// GL Mappings
router.get("/mappings", requireAuth, c.getMappings);

// VAT
router.get(
  "/vat/transactions",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getVATTransactions
);

router.get(
  "/vat/return",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getVATReturn
);

// P&L Report
router.get("/pl", requireAuth, requireRoles("admin", "manager"), c.getPL);

// Journal
router.post(
  "/journal/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  c.generateJournal
);

router.get(
  "/export/csv",
  requireAuth,
  requireRoles("admin", "manager"),
  c.exportJournal
);

// Period Close
router.post(
  "/period/close",
  requireAuth,
  requireRoles("admin", "manager"),
  c.closePeriod
);

// Period Status Check
router.get(
  "/period/close",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getPeriodStatus
);

module.exports = router;
