const express = require("express");
const router = express.Router();
const c = require("../controllers/employee-auth.controller");
const { requireAuth } = require("../middleware.js");
const { authLimiter } = require("../middleware/rateLimiter");
const { requireEmployee } = require("../middleware/employeeAuth");

router.post("/login", authLimiter, c.login);
router.get("/me", requireEmployee, c.getMe);
router.post("/change-password", requireEmployee, c.changePassword);
router.post("/set-password", requireAuth, c.setPortalPassword);
router.post("/toggle-access", requireAuth, c.togglePortalAccess);

module.exports = router;
