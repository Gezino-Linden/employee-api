// src/routes/license.routes.js
const express = require("express");
const router = express.Router();
const c = require("../controllers/license.controller");
const { requireAuth, requireRoles } = require("../middleware");

router.get("/plans", c.getPlans); // public
router.get("/me", requireAuth, c.getMyLicense); // any authed user
router.post("/activate", requireAuth, requireRoles("admin"), c.activateLicense); // admin only

module.exports = router;
