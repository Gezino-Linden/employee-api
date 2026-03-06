// File: src/routes/accounting.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/accounting.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get("/accounts", requireAuth, c.getAccounts);
router.get("/periods", requireAuth, c.getPeriods);
router.get("/mappings", requireAuth, c.getMappings);
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
router.get("/pl", requireAuth, requireRoles("admin", "manager"), c.getPL);
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
router.post(
  "/period/close",
  requireAuth,
  requireRoles("admin", "manager"),
  c.closePeriod
);
router.get(
  "/period/close",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getPeriodStatus
);

module.exports = router;
