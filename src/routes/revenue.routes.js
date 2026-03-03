// File: src/routes/revenue.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/revenue.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getRevenueSummary
);

router.post(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  c.upsertDailyRevenue
);

module.exports = router;
