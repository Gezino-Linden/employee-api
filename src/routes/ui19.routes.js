// File: src/routes/ui19.routes.js
const express = require("express");
const router = express.Router();
const ui19Controller = require("../controllers/ui19.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.post(
  "/generate",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.generate
);
router.get(
  "/declarations",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.getDeclarations
);
router.get(
  "/declarations/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.getById
);
router.post(
  "/declarations/:id/submit",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.submit
);
router.get(
  "/declarations/:id/export",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.exportCSV
);
router.patch(
  "/line-items/:id",
  requireAuth,
  requireRoles("admin", "manager"),
  ui19Controller.updateLineItem
);

module.exports = router;
