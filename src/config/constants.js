// File: src/config/constants.js
// Single source of truth for all magic values used across the API.
// Change a value here and it updates everywhere automatically.

// ── VAT ───────────────────────────────────────────────────────
const VAT = {
  RATE: 15, // South African standard VAT rate (%)
  MULTIPLIER: 0.15, // Used for calculations: amount * VAT.MULTIPLIER
  DIVISOR: 1.15, // Used to extract VAT from VAT-inclusive amount
};

// ── GL ACCOUNT CODES ──────────────────────────────────────────
const GL_ACCOUNTS = {
  SALARIES_WAGES: "6100",
  SARS_PAYE_LIABILITY: "2100",
  PENSION_LIABILITY: "2110",
  UIF_LIABILITY: "2130",
  NET_SALARIES_PAYABLE: "2150",
  TIPS_CASH: "6210",
  TIPS_CARD: "6215",
  SERVICE_CHARGES: "6200",
  VAT_CONTROL: "2200",
  SARS_VAT_PAYABLE: "2210",
};

// ── PAYMENT METHODS ───────────────────────────────────────────
const PAYMENT_METHODS = [
  "bank_transfer",
  "cash",
  "card",
  "cheque",
  "check", // legacy alias — keep for backwards compat
  "crypto",
];

// ── PAYROLL STATUSES ──────────────────────────────────────────
const PAYROLL_STATUSES = ["draft", "processed", "paid"];

// ── INVOICE STATUSES ──────────────────────────────────────────
const INVOICE_STATUSES = ["draft", "sent", "partial", "paid", "cancelled"];

// ── BILL STATUSES ─────────────────────────────────────────────
const BILL_STATUSES = ["pending", "approved", "partial", "paid", "cancelled"];

// ── REVENUE DEPARTMENTS ───────────────────────────────────────
const DEPARTMENTS = ["rooms", "fb", "spa", "events", "other"];

// ── BILL CATEGORIES ───────────────────────────────────────────
const BILL_CATEGORIES = [
  "food_beverage",
  "housekeeping",
  "maintenance",
  "utilities",
  "laundry",
  "marketing",
  "payroll",
  "general",
  "other",
];

// ── CACHE TTLs (seconds) ──────────────────────────────────────
const CACHE_TTL = {
  ACCOUNTS: 600, // 10 minutes — chart of accounts rarely changes
  MAPPINGS: 600, // 10 minutes — GL mappings rarely change
  CATEGORIES: 600, // 10 minutes — revenue categories rarely change
  SUPPLIERS: 180, // 3 minutes  — supplier list changes occasionally
};

// ── PAGINATION DEFAULTS ───────────────────────────────────────
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PER_PAGE: 50,
  MAX_PER_PAGE: 100,
};

// ── DATE / TIME ───────────────────────────────────────────────
const DATE = {
  // South African public holidays 2026
  PUBLIC_HOLIDAYS_2026: [
    "2026-01-01", // New Year's Day
    "2026-03-21", // Human Rights Day
    "2026-04-10", // Good Friday
    "2026-04-13", // Family Day
    "2026-04-27", // Freedom Day
    "2026-05-01", // Workers' Day
    "2026-06-16", // Youth Day
    "2026-08-09", // National Women's Day
    "2026-09-24", // Heritage Day
    "2026-12-16", // Day of Reconciliation
    "2026-12-25", // Christmas Day
    "2026-12-26", // Day of Goodwill
  ],
};

// ── TAX (SA PAYE 2024/2025) ───────────────────────────────────
const TAX = {
  PRIMARY_REBATE: 17235,
  SECONDARY_REBATE: 9444, // Age 65–74
  TERTIARY_REBATE: 3145, // Age 75+
  THRESHOLD_UNDER_65: 95750,
  THRESHOLD_65_TO_74: 148217,
  THRESHOLD_75_PLUS: 165689,
  UIF_RATE: 0.01, // 1% employee contribution
  UIF_MAX_MONTHLY: 177.12,
};

// ── MONTH NAMES ───────────────────────────────────────────────
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

module.exports = {
  VAT,
  GL_ACCOUNTS,
  PAYMENT_METHODS,
  PAYROLL_STATUSES,
  INVOICE_STATUSES,
  BILL_STATUSES,
  DEPARTMENTS,
  BILL_CATEGORIES,
  CACHE_TTL,
  PAGINATION,
  DATE,
  TAX,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
};
