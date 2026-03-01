const express = require("express");
const router = express.Router();
const accountingController = require("../controllers/accounting.controller");

// Chart of Accounts
router.get("/accounts", accountingController.getAccounts);

// Journal Entries - STANDARD
router.post("/journal/generate", accountingController.generateJournal);

// Journal Entries - HOSPITALITY (includes tips, service charges)
router.post(
  "/journal/hospitality",
  accountingController.generateHospitalityJournal
);

// Export
router.get("/export/:format", accountingController.exportJournal);

// GL Mappings
router.get("/mappings", accountingController.getMappings);

module.exports = router;
