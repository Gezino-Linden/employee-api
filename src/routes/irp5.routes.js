// File: src/routes/irp5.routes.js
const express = require("express");
const router = express.Router();
const irp5Controller = require("../controllers/irp5.controller");
const { requireAuth, requireRoles } = require("../middleware");

// Generate all IRP5 certificates for a tax year
router.post(
  "/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.generate
);

// Get all certificates for a tax year
router.get(
  "/certificates",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.getCertificates
);

// Get single certificate
router.get(
  "/certificates/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.getCertificateById
);

// Get HTML version of certificate (for PDF printing)
router.get(
  "/certificates/:id/html",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.getCertificateHTML
);

// Get IT3(a) reconciliation
router.get(
  "/reconciliation",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.getReconciliation
);

// Issue all certificates
router.post(
  "/issue",
  requireAuth,
  requireRoles("admin"),
  irp5Controller.issueAll
);

// Export CSV for SARS e@syFile
router.get(
  "/export",
  requireAuth,
  requireRoles("admin", "manager"),
  irp5Controller.exportCSV
);

module.exports = router;
