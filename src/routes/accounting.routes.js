// File: src/routes/accounting.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/accounting.controller");
const { requireAuth, requireRoles } = require("../middleware");

// ── Chart of Accounts ─────────────────────────────────────────
router.get("/accounts", requireAuth, c.getAccounts);

// ── Payroll Periods (for journal generator dropdown) ──────────
router.get("/periods", requireAuth, c.getPeriods);

// ── GL Mappings ───────────────────────────────────────────────
router.get("/mappings", requireAuth, c.getMappings);

// ── Journal Generation ────────────────────────────────────────
router.post(
  "/journal/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  c.generateJournal
);

// ── Journal Export ────────────────────────────────────────────
router.get(
  "/export/:format",
  requireAuth,
  requireRoles("admin", "manager"),
  c.exportJournal
);

// ── P&L Report ────────────────────────────────────────────────
// Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), property_id (optional)
router.get("/pl", requireAuth, requireRoles("admin", "manager"), c.getPL);

// ── VAT Return ────────────────────────────────────────────────
// Query params: month (1-12), year (YYYY)
router.get(
  "/vat/return",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getVATReturn
);

// ── VAT Transactions List ─────────────────────────────────────
// Query params: type (output|input), month, year
router.get(
  "/vat/transactions",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getVATTransactions
);

module.exports = router;
