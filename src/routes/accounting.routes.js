const express = require("express");
const router = express.Router();
const c = require("../controllers/accounting.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, accountingValidators } = require("../middleware/validate");

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
  "/pl",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(accountingValidators.pl),
  c.getPL
);

router.get(
  "/vat/return",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(accountingValidators.vat),
  c.getVATReturn
);

router.post(
  "/journal/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(accountingValidators.generateJournal),
  c.generateJournal
);

router.get(
  "/export/:format",
  requireAuth,
  requireRoles("admin", "manager"),
  c.exportJournal
);

router.post(
  "/period/close",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(accountingValidators.closePeriod),
  c.closePeriod
);

module.exports = router;
