// VerificationService (class diagram): UC-008 View Pending Cases, UC-009 Verify Document,
// UC-010 Reject Document, UC-011 Add Remarks; FR-016-020, BR-002-004.
import { query, withTransaction } from '../../config/db.js';
import { NOTIFICATION_TYPE, ROLES } from '../../config/constants.js';
import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../../services/audit.js';
import { getMissingDocuments, recomputeApplicationStatus } from '../documents/document.service.js';
import { messages, sendNotification } from '../notifications/notification.service.js';

/**
 * Which categories a staff member works on: verifiers only their assigned category (§11.2),
 * administrators every category. Returns a SQL condition on `column` and its parameter.
 */
function scopeFilter(user, column, paramIndex) {
  if (user.role === ROLES.ADMINISTRATOR) return { sql: 'TRUE', params: [] };
  return { sql: `${column} = $${paramIndex}`, params: [user.assignedCategoryId ?? -1] };
}

function searchFilter(search, paramIndex) {
  if (!search) return { sql: 'TRUE', params: [] };
  return {
    sql: `(u.name ILIKE $${paramIndex} OR a.application_number ILIKE $${paramIndex})`,
    params: [`%${search.replace(/[%_\\]/g, '\\$&')}%`],
  };
}

/**
 * PendingCaseDashboard.retrievePendingCases() + sortByUploadDate() (UC-008, FR-016, FR-028):
 * every document awaiting verification in the user's scope, oldest upload first.
 */
export async function getPendingCases(user, { search, categoryId } = {}) {
  const scope = scopeFilter(user, 'a.category_id', 1);
  const text = searchFilter(search, scope.params.length + 1);
  const params = [...scope.params, ...text.params];
  let categorySql = 'TRUE';
  if (categoryId && user.role === ROLES.ADMINISTRATOR) {
    params.push(categoryId);
    categorySql = `a.category_id = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT d.id, d.current_version, d.upload_date, d.remarks, d.file_name, d.mime_type,
            ci.document_type, ci.is_mandatory,
            a.id AS application_id, a.application_number,
            u.name AS applicant_name,
            c.id AS category_id, c.code AS category_code, c.name AS category_name
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       JOIN users u ON u.id = a.applicant_id
       JOIN checklist_items ci ON ci.id = d.checklist_item_id
       JOIN categories c ON c.id = a.category_id
      WHERE d.status = 'PENDING' AND ${scope.sql} AND ${text.sql} AND ${categorySql}
      ORDER BY d.upload_date ASC, d.id ASC`,
    params,
  );

  return {
    noCategoryAssigned: user.role === ROLES.VERIFIER && !user.assignedCategoryId,
    cases: rows.map((r) => ({
      documentId: r.id,
      documentType: r.document_type,
      isMandatory: r.is_mandatory,
      version: r.current_version,
      uploadDate: r.upload_date,
      fileName: r.file_name,
      // A remark on a pending document means the verifier asked for something (UC-011).
      remarks: r.remarks,
      application: { id: r.application_id, applicationNumber: r.application_number, applicantName: r.applicant_name },
      category: { id: r.category_id, code: r.category_code, name: r.category_name },
    })),
  };
}

/** Applications in the user's scope with document counts, for the "applicants" view of the dashboard. */
export async function listApplications(user, { search } = {}) {
  const scope = scopeFilter(user, 'a.category_id', 1);
  const text = searchFilter(search, scope.params.length + 1);
  const { rows } = await query(
    `SELECT a.id, a.application_number, a.overall_status, a.submission_date,
            u.name AS applicant_name, c.name AS category_name,
            count(d.id) FILTER (WHERE d.status = 'PENDING') AS pending,
            count(d.id) FILTER (WHERE d.status = 'VERIFIED') AS verified,
            count(d.id) FILTER (WHERE d.status = 'REJECTED') AS rejected,
            (SELECT count(*) FROM checklist_items ci WHERE ci.category_id = a.category_id AND ci.is_mandatory) AS mandatory_total
       FROM applications a
       JOIN users u ON u.id = a.applicant_id
       LEFT JOIN categories c ON c.id = a.category_id
       LEFT JOIN documents d ON d.application_id = a.id
      WHERE ${scope.sql} AND ${text.sql}
      GROUP BY a.id, u.name, c.name
      ORDER BY count(d.id) FILTER (WHERE d.status = 'PENDING') DESC, a.submission_date ASC`,
    [...scope.params, ...text.params],
  );
  return rows.map((r) => ({
    id: r.id,
    applicationNumber: r.application_number,
    applicantName: r.applicant_name,
    categoryName: r.category_name,
    overallStatus: r.overall_status,
    submissionDate: r.submission_date,
    counts: {
      pending: Number(r.pending),
      verified: Number(r.verified),
      rejected: Number(r.rejected),
      mandatoryTotal: Number(r.mandatory_total),
    },
  }));
}

/** One application with applicant details and its full checklist ("select an applicant", UC-009). */
export async function getApplicationForStaff(user, applicationId) {
  const { rows } = await query(
    `SELECT a.id, a.application_number, a.overall_status, a.submission_date, a.category_id,
            u.id AS applicant_id, u.name AS applicant_name, u.email, u.phone,
            c.code AS category_code, c.name AS category_name
       FROM applications a
       JOIN users u ON u.id = a.applicant_id
       LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.id = $1`,
    [applicationId],
  );
  const app = rows[0];
  const inScope = app && (user.role === ROLES.ADMINISTRATOR || app.category_id === user.assignedCategoryId);
  if (!inScope) throw new AppError(404, 'NOT_FOUND', 'Application not found.');

  const { rows: items } = await query(
    `SELECT ci.id, ci.document_type, ci.is_mandatory,
            d.id AS document_id, d.status, d.remarks, d.file_name, d.current_version, d.upload_date
       FROM checklist_items ci
       LEFT JOIN documents d ON d.checklist_item_id = ci.id AND d.application_id = $1
      WHERE ci.category_id = $2
      ORDER BY ci.is_mandatory DESC, ci.id`,
    [app.id, app.category_id],
  );
  const checklist = items.map((r) => ({
    id: r.id,
    documentType: r.document_type,
    isMandatory: r.is_mandatory,
    status: r.document_id ? r.status : 'MISSING',
    document: r.document_id
      ? { id: r.document_id, status: r.status, remarks: r.remarks, fileName: r.file_name, currentVersion: r.current_version, uploadDate: r.upload_date }
      : null,
  }));

  return {
    id: app.id,
    applicationNumber: app.application_number,
    overallStatus: app.overall_status,
    submissionDate: app.submission_date,
    applicant: { id: app.applicant_id, name: app.applicant_name, email: app.email, phone: app.phone },
    category: app.category_id ? { id: app.category_id, code: app.category_code, name: app.category_name } : null,
    checklist,
    missing: getMissingDocuments(checklist),
  };
}

async function lockDocumentInScope(client, user, documentId) {
  const { rows } = await client.query(
    `SELECT d.*, a.category_id, a.applicant_id, ci.document_type
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       JOIN checklist_items ci ON ci.id = d.checklist_item_id
      WHERE d.id = $1
      FOR UPDATE OF d`,
    [documentId],
  );
  const doc = rows[0];
  const inScope = doc && (user.role === ROLES.ADMINISTRATOR || doc.category_id === user.assignedCategoryId);
  if (!inScope) throw new AppError(404, 'NOT_FOUND', 'Document not found.');
  return doc;
}

/**
 * Verification.record() / apply() (UC-009/010/011, FR-017/018, BR-002-004).
 *   VERIFIED: remark optional        REJECTED: remark required (BR-004)
 *   PENDING:  remark required; the document stays pending and the applicant sees the remark
 * Duplicate-action guard (UC-009 exception flow): only a document that is still PENDING can be
 * decided, and only the version the verifier looked at. The row lock makes two simultaneous
 * decisions run one after the other, so the second one sees the first and is refused.
 */
export async function recordDecision(user, documentId, { status, remarks, version }) {
  return withTransaction(async (client) => {
    const doc = await lockDocumentInScope(client, user, documentId);

    if (doc.status !== 'PENDING') {
      throw new AppError(
        409,
        'ALREADY_DECIDED',
        `This document has already been ${doc.status === 'VERIFIED' ? 'verified' : 'rejected'} by another staff member.`,
      );
    }
    if (version && version !== doc.current_version) {
      throw new AppError(
        409,
        'DOCUMENT_CHANGED',
        'The applicant uploaded a new file while you were reviewing. Please review the latest version.',
      );
    }

    const { rows: [updated] } = await client.query(
      `UPDATE documents SET status = $2, remarks = $3, updated_at = now() WHERE id = $1 RETURNING *`,
      [doc.id, status, remarks ?? null],
    );
    await client.query(
      `INSERT INTO verification_records (document_id, verifier_id, status, remarks) VALUES ($1, $2, $3, $4)`,
      [doc.id, user.id, status, remarks ?? null],
    );
    // VerificationHistory.addEntry() is the insert above; then refresh the application status.
    await recomputeApplicationStatus({ applicationId: doc.application_id }, client);
    await recordAudit(
      {
        actorId: user.id,
        action: status === 'PENDING' ? 'REMARK_ADDED' : `DOCUMENT_${status}`,
        entityType: 'document',
        entityId: doc.id,
        details: { applicationId: doc.application_id, documentType: doc.document_type, version: doc.current_version, remarks },
      },
      client,
    );
    // BR-009 / FR-024: Verification.generate() -> the applicant hears about the outcome. A rejection
    // asks for a corrected copy (FR-026); a remark on a pending document is REMARK_ADDED.
    await sendNotification(
      {
        recipientIds: doc.applicant_id,
        type: status === 'PENDING' ? NOTIFICATION_TYPE.REMARK_ADDED : NOTIFICATION_TYPE.STATUS_UPDATE,
        message:
          status === 'VERIFIED'
            ? messages.verified(doc.document_type)
            : status === 'REJECTED'
              ? messages.rejected(doc.document_type, remarks)
              : messages.remark(doc.document_type, remarks),
        link: `/applicant/documents/${doc.checklist_item_id}`,
      },
      client,
    );
    return { documentId: updated.id, documentType: doc.document_type, status: updated.status, remarks: updated.remarks };
  });
}

/** FR-019: an administrator corrects a decision already made, with a mandatory reason. */
export async function correctDecision(user, documentId, { status, reason }) {
  return withTransaction(async (client) => {
    const doc = await lockDocumentInScope(client, user, documentId);
    if (doc.status === 'PENDING') {
      throw new AppError(409, 'NOT_DECIDED', 'This document has not been decided yet, so there is nothing to correct.');
    }
    if (doc.status === status) {
      throw new AppError(400, 'NO_CHANGE', `The document is already ${status.toLowerCase()}.`, { status: 'Choose a different status.' });
    }

    // Reopening (back to PENDING) clears the remark shown to the applicant; a rejection shows the reason.
    const applicantRemark = status === 'REJECTED' ? reason : null;
    await client.query(`UPDATE documents SET status = $2, remarks = $3, updated_at = now() WHERE id = $1`, [
      doc.id,
      status,
      applicantRemark,
    ]);
    await client.query(
      `INSERT INTO verification_records (document_id, verifier_id, status, remarks, is_correction) VALUES ($1, $2, $3, $4, true)`,
      [doc.id, user.id, status, reason],
    );
    await recomputeApplicationStatus({ applicationId: doc.application_id }, client);
    await recordAudit(
      {
        actorId: user.id,
        action: 'DECISION_CORRECTED',
        entityType: 'document',
        entityId: doc.id,
        details: { applicationId: doc.application_id, documentType: doc.document_type, from: doc.status, to: status, reason },
      },
      client,
    );
    await sendNotification(
      {
        recipientIds: doc.applicant_id,
        type: NOTIFICATION_TYPE.STATUS_UPDATE,
        message: messages.corrected(doc.document_type, status, reason),
        link: `/applicant/documents/${doc.checklist_item_id}`,
      },
      client,
    );
    return { documentId: doc.id, documentType: doc.document_type, status };
  });
}

/** FR-025: staff remind an applicant of the documents still missing from their application. */
export async function remindMissingDocuments(user, applicationId) {
  const application = await getApplicationForStaff(user, applicationId);
  if (application.missing.length === 0) {
    throw new AppError(400, 'NOTHING_MISSING', 'This application has no missing documents.');
  }
  return withTransaction(async (client) => {
    await sendNotification(
      {
        recipientIds: application.applicant.id,
        type: NOTIFICATION_TYPE.MISSING_DOCUMENT,
        message: messages.reminder(application.missing.map((m) => m.documentType)),
        link: '/applicant',
      },
      client,
    );
    await recordAudit(
      {
        actorId: user.id,
        action: 'REMINDER_SENT',
        entityType: 'application',
        entityId: application.id,
        details: { missing: application.missing.map((m) => m.documentType) },
      },
      client,
    );
    return { applicantName: application.applicant.name, missing: application.missing.length };
  });
}
