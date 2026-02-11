const rateLimit = require("express-rate-limit");

// General API limiter (safe default)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 mins
  max: 300, // 300 requests per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Stricter for login/register (brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 attempts per 15 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
});

// Optional: even stricter just for login
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10, // 10 logins per 10 mins per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

module.exports = { apiLimiter, authLimiter, loginLimiter };
