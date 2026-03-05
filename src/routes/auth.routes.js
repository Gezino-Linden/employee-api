// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../controllers/auth.controller");
const { authLimiter, apiLimiter } = require("../middleware/rateLimiter");
// Note: file is rateLimiter.js (no 's') at src/middleware/rateLimiter.js

router.post("/register", apiLimiter, auth.register);
router.post("/login", authLimiter, auth.login);
router.post("/accept-invite", apiLimiter, auth.acceptInvite);
router.post("/validate-key", apiLimiter, auth.validateKey);

module.exports = router;
