// File: src/routes/invoices.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/invoices.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get("/categories", requireAuth, c.getCategories);
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getARSummary
);
router.get("/", requireAuth, requireRoles("admin", "manager"), c.getInvoices);
router.get("/:id", requireAuth, requireRoles("admin", "manager"), c.getInvoice);
router.post(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  c.createInvoice
);
router.patch(
  "/:id/status",
  requireAuth,
  requireRoles("admin", "manager"),
  c.updateStatus
);
router.post(
  "/:id/lines",
  requireAuth,
  requireRoles("admin", "manager"),
  c.addLineItem
);
router.delete(
  "/:id/lines/:lineId",
  requireAuth,
  requireRoles("admin", "manager"),
  c.deleteLineItem
);
router.post(
  "/:id/payments",
  requireAuth,
  requireRoles("admin", "manager"),
  c.recordPayment
);

module.exports = router;
