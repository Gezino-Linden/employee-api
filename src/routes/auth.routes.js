// src/routes/auth.routes.js
const express = require("express");
const router = express.Router();
const auth = require("../controllers/auth.controller");
const { authLimiter, apiLimiter } = require("../middleware/rateLimiter");

router.post("/register", apiLimiter, auth.register);
router.post("/login", authLimiter, auth.login);
router.post("/accept-invite", apiLimiter, auth.acceptInvite);
router.post("/validate-key", apiLimiter, auth.validateKey);
router.post("/forgot-password", authLimiter, auth.forgotPassword);
router.post("/reset-password", apiLimiter, auth.resetPassword);

module.exports = router;
