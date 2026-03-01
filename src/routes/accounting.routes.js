const express = require("express");
const router = express.Router();
const accountingController = require("../controllers/accounting.controller");

// Chart of Accounts
router.get("/accounts", accountingController.getAccounts);

// Journal Generation (handles both standard and hospitality)
router.post("/journal/generate", accountingController.generateJournal);

// Export
router.get("/export/:format", accountingController.exportJournal);

// GL Mappings
router.get("/mappings", accountingController.getMappings);

module.exports = router;
