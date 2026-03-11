const express = require("express");
const router = express.Router();
const c = require("../controllers/ap.controller");
const { requireAuth, requireRoles } = require("../middleware");
const { validate, apValidators } = require("../middleware/validate");
const { requireFeature } = require("../middleware/license");

router.get("/summary", requireAuth, requireRoles("admin", "manager"), c.getAPSummary);
router.get("/suppliers", requireAuth, c.getSuppliers);
router.get("/bills", requireAuth, requireRoles("admin", "manager"), c.getBills);
router.get("/ageing", requireAuth, requireRoles("admin", "manager"), requireFeature("ap_ageing"), c.getAPAgeing);
router.post("/suppliers", requireAuth, requireRoles("admin", "manager"), validate(apValidators.createSupplier), c.createSupplier);
router.patch("/suppliers/:id", requireAuth, requireRoles("admin", "manager"), c.updateSupplier);
router.post("/bills", requireAuth, requireRoles("admin", "manager"), validate(apValidators.createBill), c.createBill);
router.patch("/bills/:id/pay", requireAuth, requireRoles("admin", "manager"), validate(apValidators.payBill), c.payBill);

module.exports = router;
