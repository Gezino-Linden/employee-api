const express = require("express");
const router = express.Router();
const c = require("../controllers/invoices.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, invoiceValidators } = require("../middleware/validate");
const { requireFeature } = require("../middleware/license");

router.get("/categories", requireAuth, c.getCategories);
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getARSummary
);
router.get(
  "/ageing",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getARAgeing
);

router.get("/", requireAuth, requireRoles("admin", "manager"), c.getInvoices);
router.get("/:id", requireAuth, requireRoles("admin", "manager"), c.getInvoice);
router.get("/ageing", requireAuth, requireFeature("ar_ageing"), c.getARAgeing);

router.post(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  validate(invoiceValidators.create),
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
  validate(invoiceValidators.payment),
  c.recordPayment
);

module.exports = router;
