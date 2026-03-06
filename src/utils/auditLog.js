// src/utils/auditLog.js
// Call this anywhere you want to log a change

const db = require("../db");

/**
 * logAudit({
 *   req,           // express request (gets user + ip)
 *   action,        // 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'PROCESS'
 *   entityType,    // 'employee' | 'payroll' | 'leave' | 'salary'
 *   entityId,      // record id
 *   entityName,    // human readable e.g. "John Smith"
 *   changes,       // { field: { old: x, new: y } } — optional
 * })
 */
async function logAudit({
  req,
  action,
  entityType,
  entityId,
  entityName,
  changes,
}) {
  try {
    const user = req?.user;
    const ip = req?.ip || req?.headers?.["x-forwarded-for"] || null;
    await db.query(
      `INSERT INTO audit_logs
        (company_id, performed_by, performed_by_name, performed_by_role,
         action, entity_type, entity_id, entity_name, changes, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        user?.company_id || null,
        user?.id || null,
        user?.name || user?.email || null,
        user?.role || null,
        action,
        entityType,
        entityId || null,
        entityName || null,
        changes ? JSON.stringify(changes) : null,
        ip,
      ]
    );
  } catch (err) {
    // Never crash the main request if audit logging fails
    console.error("Audit log error:", err.message);
  }
}

module.exports = { logAudit };
