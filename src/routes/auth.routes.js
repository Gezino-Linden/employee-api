const express = require("express");
const router = express.Router();

const authController = require("../controllers/auth.controller");
const { loginLimiter } = require("../security/rateLimiters");

router.post("/register", authController.register);
router.post("/login", loginLimiter, authController.login);

module.exports = router;
