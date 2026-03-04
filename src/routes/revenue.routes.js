// File: src/routes/revenue.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/revenue.controller");
const { requireAuth, requireRoles } = require("../middleware");

// GET daily revenue entries (the missing route!)
router.get(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getDailyRevenue
);

// GET revenue summary
router.get(
  "/summary",
  requireAuth,
  requireRoles("admin", "manager"),
  c.getRevenueSummary
);

// POST/UPDATE daily revenue
router.post(
  "/",
  requireAuth,
  requireRoles("admin", "manager"),
  c.upsertDailyRevenue
);

module.exports = router;
