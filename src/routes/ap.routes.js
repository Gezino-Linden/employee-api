// File: src/routes/ap.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/ap.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getAPSummary
);
router.get("/suppliers", requireAuth, c.getSuppliers);
router.post(
  "/suppliers",
  requireAuth,
  requireRoles("admin", "manager"),
  c.createSupplier
);
router.patch(
  "/suppliers/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  c.updateSupplier
);
router.get("/bills", requireAuth, requireRoles("admin", "manager"), c.getBills);
router.post(
  "/bills",
  requireAuth,
  requireRoles("admin", "manager"),
  c.createBill
);
router.patch(
  "/bills/:id/pay",
  requireAuth,
  requireRoles("admin", "manager"),
  c.payBill
);

module.exports = router;
