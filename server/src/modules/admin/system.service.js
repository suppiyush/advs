// System configuration (FR-034) and the audit log (FR-035, NFR-007, NFR-020).
import { query, withTransaction } from '../../config/db.js';
import { recordAudit } from '../../services/audit.js';
import { DEFAULT_SETTINGS } from '../../services/settings.js';

const KEYS = { registrationOpen: 'registration_open', maxUploadMb: 'max_upload_mb', allowedMimeTypes: 'allowed_mime_types' };

export async function getSettings() {
  const { rows } = await query('SELECT key, value, updated_at FROM system_settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const lastUpdated = rows.reduce((latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest), null);
  return {
    ...Object.fromEntries(Object.entries(KEYS).map(([field, key]) => [field, stored[key] ?? DEFAULT_SETTINGS[key]])),
    updatedAt: lastUpdated,
  };
}

export async function updateSettings(changes, actorId) {
  return withTransaction(async (client) => {
    const before = await getSettings();
    for (const [field, value] of Object.entries(changes)) {
      await client.query(
        `INSERT INTO system_settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [KEYS[field], JSON.stringify(value), actorId],
      );
    }
    await recordAudit(
      {
        actorId,
        action: 'SETTINGS_UPDATED',
        entityType: 'settings',
        details: { before: Object.fromEntries(Object.keys(changes).map((f) => [f, before[f]])), changes },
      },
      client,
    );
  }).then(getSettings);
}

const PAGE_SIZE = 50;

export async function getAuditLog({ action, actorId, from, to, page = 1 } = {}) {
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (action) add('l.action = ?', action);
  if (actorId) add('l.actor_id = ?', actorId);
  if (from) add('l.created_at >= ?', from);
  if (to) add('l.created_at < ?::date + 1', to); // inclusive end date
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [{ rows }, { rows: countRows }, { rows: actions }] = await Promise.all([
    query(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.created_at, u.name AS actor_name, u.role AS actor_role
         FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
         ${whereSql}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      params,
    ),
    query(`SELECT count(*) FROM audit_logs l ${whereSql}`, params),
    query('SELECT DISTINCT action FROM audit_logs ORDER BY action'),
  ]);

  return {
    entries: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      details: r.details,
      createdAt: r.created_at,
      actor: r.actor_name ? { name: r.actor_name, role: r.actor_role } : null,
    })),
    total: Number(countRows[0].count),
    page,
    pageSize: PAGE_SIZE,
    actions: actions.map((a) => a.action),
  };
}
