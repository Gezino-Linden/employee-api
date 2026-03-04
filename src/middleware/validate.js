// File: src/middleware/validate.js
const { validationResult, body, param, query } = require("express-validator");
const logger = require("../utils/logger");

// ── Core validate runner ──────────────────────────────────────
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation failed", {
        url: req.url,
        method: req.method,
        errors: errors.array(),
        user: req.user?.id,
      });
      return res.status(400).json({
        error: "Validation failed",
        details: errors.array().map((e) => ({
          field: e.path,
          message: e.msg,
          value: e.value,
        })),
      });
    }
    next();
  };
};

// ── Reusable field validators ─────────────────────────────────
const validators = {
  // Auth
  email: body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email required"),
  password: body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  // IDs
  id: param("id")
    .isInt({ min: 1 })
    .withMessage("ID must be a positive integer"),
  employee_id: body("employee_id")
    .isInt({ min: 1 })
    .withMessage("Valid employee ID required"),

  // Date / Period
  month: query("month")
    .isInt({ min: 1, max: 12 })
    .withMessage("Month must be 1-12"),
  year: query("year")
    .isInt({ min: 2000, max: 2100 })
    .withMessage("Year must be 2000-2100"),
  date: (field) =>
    body(field)
      .isDate({ format: "YYYY-MM-DD" })
      .withMessage(`${field} must be YYYY-MM-DD`),

  // Money
  amount: (field = "amount") =>
    body(field)
      .isFloat({ min: 0 })
      .withMessage(`${field} must be a positive number`),

  // Strings
  requiredString: (field) =>
    body(field).notEmpty().trim().withMessage(`${field} is required`),

  optionalString: (field) => body(field).optional().trim(),

  // Enums
  enum: (field, values) =>
    body(field)
      .isIn(values)
      .withMessage(`${field} must be one of: ${values.join(", ")}`),

  // South African specific
  saId: body("id_number")
    .optional()
    .matches(/^\d{13}$/)
    .withMessage("SA ID number must be 13 digits"),

  saVat: body("vat_number")
    .optional()
    .matches(/^\d{10}$/)
    .withMessage("VAT number must be 10 digits"),

  phone: body("phone")
    .optional()
    .matches(/^(\+27|0)[6-8][0-9]{8}$/)
    .withMessage("Valid SA phone number required (e.g. 0821234567)"),
};

// ── Pre-built validation chains for each route group ─────────

// Auth
const authValidators = {
  login: [validators.email, validators.password],
  register: [
    validators.email,
    validators.password,
    validators.requiredString("name"),
  ],
};

// Employees
const employeeValidators = {
  create: [
    validators.requiredString("first_name"),
    validators.requiredString("last_name"),
    validators.email,
    validators.optionalString("department"),
    validators.optionalString("position"),
    body("salary")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Salary must be positive"),
    validators.saId,
    validators.phone,
  ],
  update: [
    validators.id,
    body("first_name").optional().trim(),
    body("last_name").optional().trim(),
    body("email").optional().isEmail().normalizeEmail(),
    body("salary").optional().isFloat({ min: 0 }),
    validators.saId,
    validators.phone,
  ],
};

// Payroll
const payrollValidators = {
  initialize: [
    body("month").isInt({ min: 1, max: 12 }).withMessage("Month must be 1-12"),
    body("year")
      .isInt({ min: 2000, max: 2100 })
      .withMessage("Year must be 2000-2100"),
  ],
  process: [
    body("month").isInt({ min: 1, max: 12 }),
    body("year").isInt({ min: 2000, max: 2100 }),
    body("employee_ids")
      .isArray({ min: 1 })
      .withMessage("employee_ids must be a non-empty array"),
    body("employee_ids.*")
      .isInt({ min: 1 })
      .withMessage("Each employee ID must be a positive integer"),
  ],
  markPaid: [
    validators.id,
    validators.enum("payment_method", [
      "bank_transfer",
      "cash",
      "check",
      "crypto",
    ]),
    body("payment_date")
      .optional()
      .isDate()
      .withMessage("payment_date must be YYYY-MM-DD"),
  ],
  update: [
    validators.id,
    body("allowances").optional().isFloat({ min: 0 }),
    body("bonuses").optional().isFloat({ min: 0 }),
    body("overtime").optional().isFloat({ min: 0 }),
    body("medical_aid").optional().isFloat({ min: 0 }),
    body("other_deductions").optional().isFloat({ min: 0 }),
  ],
};

// Invoices (AR)
const invoiceValidators = {
  create: [
    validators.requiredString("guest_name"),
    body("guest_email").optional().isEmail().normalizeEmail(),
    body("due_date")
      .optional()
      .isDate()
      .withMessage("due_date must be YYYY-MM-DD"),
    body("line_items").optional().isArray(),
    body("line_items.*.unit_price").optional().isFloat({ min: 0 }),
    body("line_items.*.quantity").optional().isInt({ min: 1 }),
  ],
  payment: [
    validators.id,
    validators.amount("amount"),
    validators.enum("payment_method", [
      "bank_transfer",
      "cash",
      "card",
      "cheque",
    ]),
    body("payment_date").optional().isDate(),
  ],
};

// Suppliers & Bills (AP)
const apValidators = {
  createSupplier: [
    validators.requiredString("name"),
    body("email").optional().isEmail().normalizeEmail(),
    validators.saVat,
    body("payment_terms").optional().isInt({ min: 0, max: 365 }),
  ],
  createBill: [
    body("supplier_id")
      .isInt({ min: 1 })
      .withMessage("Valid supplier ID required"),
    validators.requiredString("description"),
    validators.amount("subtotal"),
    body("vat_amount").optional().isFloat({ min: 0 }),
    body("invoice_date")
      .isDate()
      .withMessage("invoice_date must be YYYY-MM-DD"),
    body("due_date").optional().isDate(),
  ],
  payBill: [
    validators.id,
    validators.enum("payment_method", [
      "bank_transfer",
      "cash",
      "card",
      "cheque",
    ]),
    validators.amount("amount"),
  ],
};

// Revenue
const revenueValidators = {
  upsert: [
    body("revenue_date")
      .isDate()
      .withMessage("revenue_date must be YYYY-MM-DD"),
    body("rooms_revenue").optional().isFloat({ min: 0 }),
    body("fb_revenue").optional().isFloat({ min: 0 }),
    body("spa_revenue").optional().isFloat({ min: 0 }),
    body("events_revenue").optional().isFloat({ min: 0 }),
    body("other_revenue").optional().isFloat({ min: 0 }),
    body("rooms_available").optional().isInt({ min: 0 }),
    body("rooms_occupied").optional().isInt({ min: 0 }),
    body("occupancy_rate").optional().isFloat({ min: 0, max: 100 }),
  ],
};

// Accounting
const accountingValidators = {
  generateJournal: [
    body("payroll_period_id")
      .isInt({ min: 1 })
      .withMessage("Valid payroll_period_id required"),
    validators.enum("type", ["standard", "hospitality"]),
    body("property_id").optional().isInt({ min: 1 }),
  ],
  closePeriod: [
    body("month").isInt({ min: 1, max: 12 }).withMessage("Month must be 1-12"),
    body("year")
      .isInt({ min: 2000, max: 2100 })
      .withMessage("Year must be 2000-2100"),
  ],
  pl: [
    query("from").isDate().withMessage("from must be YYYY-MM-DD"),
    query("to").isDate().withMessage("to must be YYYY-MM-DD"),
  ],
  vat: [
    query("month").isInt({ min: 1, max: 12 }).withMessage("Month must be 1-12"),
    query("year")
      .isInt({ min: 2000, max: 2100 })
      .withMessage("Year must be 2000-2100"),
  ],
};

module.exports = {
  validate,
  validators,
  authValidators,
  employeeValidators,
  payrollValidators,
  invoiceValidators,
  apValidators,
  revenueValidators,
  accountingValidators,
};
