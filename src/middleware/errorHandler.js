// File: src/middleware/errorHandler.js
const logger = require("../utils/logger");

/**
 * Custom Error Class for API errors
 */
class ApiError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true; // Distinguishes operational errors from programming errors
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized Error Handler Middleware
 * Must be registered LAST in server.js (after all routes)
 */
const errorHandler = (err, req, res, next) => {
  // Default to 500 server error
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Log the error
  logger.logError(err, req);

  // Handle specific error types

  // PostgreSQL errors
  if (err.code && err.code.startsWith("23")) {
    statusCode = 400;

    // Unique constraint violation
    if (err.code === "23505") {
      const match = err.detail?.match(/Key \((.*?)\)=/);
      const field = match ? match[1] : "field";
      message = `Duplicate ${field}. This ${field} already exists.`;
    }

    // Foreign key violation
    if (err.code === "23503") {
      message = "Invalid reference. The referenced record does not exist.";
    }

    // Not null violation
    if (err.code === "23502") {
      const match = err.message.match(/column "(.+?)"/);
      const field = match ? match[1] : "field";
      message = `Missing required field: ${field}`;
    }
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your session has expired. Please log in again.";
  }

  // Validation errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
  }

  // Multer file upload errors
  if (err.name === "MulterError") {
    statusCode = 400;
    message = `File upload error: ${err.message}`;
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== "production";

  // Send error response
  res.status(statusCode).json({
    error: message,
    ...(isDevelopment && {
      stack: err.stack,
      details: err.detail,
      code: err.code,
    }),
  });
};

/**
 * 404 Handler for undefined routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(
    `Route not found: ${req.method} ${req.originalUrl}`,
    404
  );
  next(error);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
};
