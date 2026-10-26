// Audit log for significant administrative and verification actions (FR-035, NFR-007, NFR-020).
import { query } from '../config/db.js';

export async function recordAudit({ actorId, action, entityType, entityId, details }, db = { query }) {
  await db.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId ?? null, action, entityType ?? null, entityId != null ? String(entityId) : null, details ?? null],
  );
}
