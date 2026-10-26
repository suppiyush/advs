// NotificationService (class diagram): sendNotification(), markAsRead(); FR-024-027, BR-009.
// Notifications are created inside the same transaction as the action that causes them, so a
// status change and its notification are saved together or not at all (BR-009).
import { query } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';

/**
 * Notification state diagram: generate() -> Generated -> send() -> Sent -> markRead() -> Read.
 * The only channel today is in-app, where delivery is the stored row itself and cannot fail, so
 * notifications are stored directly as SENT. An email/SMS channel (future scope) would store
 * GENERATED, call the gateway, and move to SENT or FAILED (retry() later).
 */
export async function sendNotification({ recipientIds, type, message, link = null }, db = { query }) {
  const ids = [...new Set([].concat(recipientIds).filter(Boolean))];
  if (ids.length === 0) return 0;
  const { rowCount } = await db.query(
    `INSERT INTO notifications (recipient_id, type, message, link, status)
     SELECT unnest($1::int[]), $2, $3, $4, 'SENT'`,
    [ids, type, message, link],
  );
  return rowCount;
}

/** Active verifiers responsible for a category (FR-027 "relevant staff"). */
export async function verifierIdsForCategory(categoryId, db = { query }) {
  const { rows } = await db.query(
    `SELECT id FROM users WHERE role = 'VERIFIER' AND is_active AND assigned_category_id = $1`,
    [categoryId],
  );
  return rows.map((r) => r.id);
}

function listOf(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0];
}

/** Ends a free-text remark as a sentence, without doubling its own full stop. */
function sentence(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// Message builders, kept together so the wording is consistent.
export const messages = {
  welcome: (applicationNumber, missing) =>
    missing.length
      ? `Your application ${applicationNumber} has been created. Please upload: ${listOf(missing)}.`
      : `Your application ${applicationNumber} has been created.`,
  reminder: (missing) =>
    `Reminder: your application is incomplete. Please upload ${missing.length === 1 ? 'this document' : `these ${missing.length} documents`}: ${listOf(missing)}.`,
  newChecklistItem: (documentType) => `A new required document has been added to your checklist: ${documentType}. Please upload it.`,
  verified: (documentType) => `Your ${documentType} has been verified.`,
  rejected: (documentType, remarks) =>
    `Your ${documentType} was rejected. Reason: ${sentence(remarks)} Please upload a corrected copy.`,
  remark: (documentType, remarks) => `The admission office added a remark on your ${documentType}: "${remarks}"`,
  corrected: (documentType, status, reason) =>
    status === 'PENDING'
      ? `Your ${documentType} will be reviewed again: "${reason}"`
      : `The status of your ${documentType} was corrected to ${status === 'VERIFIED' ? 'Verified' : 'Rejected'}: "${reason}"`,
  newSubmission: (applicantName, applicationNumber, documentType, action) =>
    `${applicantName} (${applicationNumber}) ${{ UPLOADED: 'uploaded', REPLACED: 'replaced', RESUBMITTED: 'resubmitted' }[action]} ${documentType}.`,
};

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    link: row.link,
    status: row.status,
    isRead: row.status === 'READ',
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function listNotifications(userId, { limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE recipient_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(toNotification);
}

export async function countUnread(userId) {
  const { rows } = await query(`SELECT count(*) FROM notifications WHERE recipient_id = $1 AND status <> 'READ'`, [userId]);
  return Number(rows[0].count);
}

/** Notification.markRead(): Sent -> Read when the recipient opens it. */
export async function markAsRead(userId, notificationId) {
  const { rows } = await query(
    `UPDATE notifications SET status = 'READ', read_at = COALESCE(read_at, now())
      WHERE id = $1 AND recipient_id = $2
      RETURNING *`,
    [notificationId, userId],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  return toNotification(rows[0]);
}

export async function markAllAsRead(userId) {
  const { rowCount } = await query(
    `UPDATE notifications SET status = 'READ', read_at = now() WHERE recipient_id = $1 AND status <> 'READ'`,
    [userId],
  );
  return rowCount;
}
