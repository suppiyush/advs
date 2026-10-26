// DocumentService (class diagram): checklist view, missing documents, application status,
// upload (UC-005, UC-012) and access-checked document retrieval.
import path from 'node:path';
import { query, withTransaction } from '../../config/db.js';
import { ROLES } from '../../config/constants.js';
import { AppError } from '../../middleware/errorHandler.js';
import { openFile, removeFile, saveFile, sniffMimeType } from '../../services/fileStore.js';
import { getSetting } from '../../services/settings.js';

const MIME_LABELS = { 'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG' };

/**
 * Recomputes applications.overall_status (plan §2.3 rule 6) for one application or for every
 * application in a category. Mandatory checklist items only:
 *   no mandatory items configured -> PENDING
 *   any rejected                  -> REJECTED
 *   all verified                  -> COMPLETED (BR-005)
 *   all uploaded                  -> UNDER_REVIEW
 *   otherwise (some missing)      -> PENDING
 */
export async function recomputeApplicationStatus({ applicationId, categoryId }, db = { query }) {
  const [filter, value] = applicationId != null ? ['a2.id = $1', applicationId] : ['a2.category_id = $1', categoryId];
  await db.query(
    `UPDATE applications a
        SET overall_status = s.status, updated_at = now()
       FROM (
         SELECT a2.id,
                CASE
                  WHEN count(ci.id) = 0 THEN 'PENDING'
                  WHEN count(*) FILTER (WHERE d.status = 'REJECTED') > 0 THEN 'REJECTED'
                  WHEN count(*) FILTER (WHERE d.status = 'VERIFIED') = count(ci.id) THEN 'COMPLETED'
                  WHEN count(*) FILTER (WHERE d.id IS NULL) = 0 THEN 'UNDER_REVIEW'
                  ELSE 'PENDING'
                END AS status
           FROM applications a2
           LEFT JOIN checklist_items ci ON ci.category_id = a2.category_id AND ci.is_mandatory
           LEFT JOIN documents d ON d.application_id = a2.id AND d.checklist_item_id = ci.id
          WHERE ${filter}
          GROUP BY a2.id
       ) s
      WHERE a.id = s.id AND a.overall_status <> s.status`,
    [value],
  );
}

/** Checklist items of the application's category, each with the applicant's current document (if any). */
async function getChecklistWithDocuments(applicationId, categoryId) {
  const { rows } = await query(
    `SELECT ci.id, ci.document_type, ci.is_mandatory,
            d.id AS document_id, d.status, d.remarks, d.file_name, d.current_version, d.upload_date
       FROM checklist_items ci
       LEFT JOIN documents d ON d.checklist_item_id = ci.id AND d.application_id = $1
      WHERE ci.category_id = $2
      ORDER BY ci.is_mandatory DESC, ci.id`,
    [applicationId, categoryId],
  );
  return rows.map((r) => ({
    id: r.id,
    documentType: r.document_type,
    isMandatory: r.is_mandatory,
    // MISSING is a display status for items with nothing uploaded; documents themselves are
    // PENDING / VERIFIED / REJECTED (BR-003).
    status: r.document_id ? r.status : 'MISSING',
    document: r.document_id
      ? {
          id: r.document_id,
          status: r.status,
          remarks: r.remarks,
          fileName: r.file_name,
          currentVersion: r.current_version,
          uploadDate: r.upload_date,
        }
      : null,
  }));
}

/**
 * MissingDocumentList (FR-021, AC-12/13/14): mandatory items with nothing uploaded, or whose
 * document was rejected. Pending and verified documents are never missing.
 */
export function getMissingDocuments(checklist) {
  return checklist
    .filter((item) => item.isMandatory && (item.status === 'MISSING' || item.status === 'REJECTED'))
    .map((item) => ({ id: item.id, documentType: item.documentType, status: item.status }));
}

/** Upload rules from system configuration (FR-015, FR-034), also shown to the applicant. */
export async function getUploadRules() {
  const [maxUploadMb, allowedMimeTypes] = await Promise.all([getSetting('max_upload_mb'), getSetting('allowed_mime_types')]);
  return {
    maxUploadMb,
    allowedMimeTypes,
    allowedFormats: allowedMimeTypes.map((m) => MIME_LABELS[m] ?? m),
  };
}

async function findApplicationRow(applicantId) {
  const { rows } = await query(
    `SELECT a.id, a.application_number, a.overall_status, a.submission_date,
            c.id AS category_id, c.code AS category_code, c.name AS category_name
       FROM applications a
       LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.applicant_id = $1
      ORDER BY a.submission_date DESC
      LIMIT 1`,
    [applicantId],
  );
  return rows[0] ?? null;
}

export async function getApplicationForApplicant(applicantId) {
  const row = await findApplicationRow(applicantId);
  if (!row) return null;

  const checklist = row.category_id ? await getChecklistWithDocuments(row.id, row.category_id) : [];
  const mandatory = checklist.filter((i) => i.isMandatory);

  return {
    id: row.id,
    applicationNumber: row.application_number,
    overallStatus: row.overall_status,
    // FR-023: incomplete until every mandatory document is verified
    isComplete: row.overall_status === 'COMPLETED',
    submissionDate: row.submission_date,
    category: row.category_id ? { id: row.category_id, code: row.category_code, name: row.category_name } : null,
    checklist,
    missing: getMissingDocuments(checklist),
    progress: {
      mandatoryTotal: mandatory.length,
      verified: mandatory.filter((i) => i.status === 'VERIFIED').length,
      uploaded: mandatory.filter((i) => i.status === 'PENDING' || i.status === 'VERIFIED').length,
    },
    uploadRules: await getUploadRules(),
  };
}

/** Document.validateFormat() / DocumentFile.validate() (FR-015): real type and size. */
export async function validateFile(file) {
  if (!file) {
    throw new AppError(400, 'NO_FILE', 'Choose a file to upload.', { file: 'Choose a file to upload.' });
  }
  const rules = await getUploadRules();
  // "PDF, JPG or PNG"
  const formats =
    rules.allowedFormats.length > 1
      ? `${rules.allowedFormats.slice(0, -1).join(', ')} or ${rules.allowedFormats.at(-1)}`
      : rules.allowedFormats[0];
  const fail = (message) => {
    throw new AppError(422, 'INVALID_FILE', message, { file: message });
  };

  if (file.size === 0) fail('The file is empty.');
  if (file.size > rules.maxUploadMb * 1024 * 1024) {
    fail(`The file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The maximum size is ${rules.maxUploadMb} MB.`);
  }
  const mimeType = sniffMimeType(file.buffer);
  if (!mimeType || !rules.allowedMimeTypes.includes(mimeType)) {
    fail(`This file is not a valid ${formats} file. Please upload a ${formats} file instead.`);
  }
  return mimeType;
}

/** Keeps the original file name for display, without paths or control characters. */
function cleanFileName(originalName, mimeType) {
  const base = path.basename(String(originalName || '')).replace(/[\x00-\x1f\x7f"\\/]/g, '').trim();
  return (base || `document.${MIME_LABELS[mimeType]?.toLowerCase() ?? 'bin'}`).slice(0, 200);
}

/**
 * UC-005 Upload Document / UC-012 Resubmit Document (FR-011-013, BR-001, BR-006, BR-007).
 * Replace/resubmit rules (plan §2.3 rule 1):
 *   no document -> upload (version 1)
 *   PENDING     -> replace, only with confirmReplace (UC-005 alternative flow)
 *   REJECTED    -> resubmit, back to PENDING
 *   VERIFIED    -> locked (final state)
 */
export async function uploadDocument(applicantId, { checklistItemId, confirmReplace }, file) {
  const application = await findApplicationRow(applicantId);
  if (!application) throw new AppError(404, 'NO_APPLICATION', 'No application found for your account.');
  if (!application.category_id) {
    throw new AppError(400, 'NO_CATEGORY', 'Your admission category has not been set yet, so you cannot upload documents.');
  }

  const { rows: items } = await query('SELECT id, document_type FROM checklist_items WHERE id = $1 AND category_id = $2', [
    checklistItemId,
    application.category_id,
  ]);
  const item = items[0];
  if (!item) {
    throw new AppError(400, 'INVALID_ITEM', 'This document is not on the checklist for your category.', {
      checklistItemId: 'Choose a document from your checklist.',
    });
  }

  const checkExisting = (existing) => {
    if (existing?.status === 'VERIFIED') {
      throw new AppError(409, 'DOCUMENT_LOCKED', `${item.document_type} has already been verified and cannot be changed.`);
    }
    if (existing?.status === 'PENDING' && !confirmReplace) {
      throw new AppError(
        409,
        'CONFIRM_REPLACE',
        `You have already uploaded ${item.document_type} and it is awaiting verification. Replace it with the new file?`,
      );
    }
  };

  // Fail fast before storing anything; re-checked under a row lock below.
  const { rows: before } = await query('SELECT status FROM documents WHERE application_id = $1 AND checklist_item_id = $2', [
    application.id,
    item.id,
  ]);
  checkExisting(before[0]);

  const mimeType = await validateFile(file);
  const fileName = cleanFileName(file.originalname, mimeType);
  const storagePath = await saveFile(file.buffer, { applicationId: application.id, mimeType });

  try {
    return await withTransaction(async (client) => {
      const { rows: locked } = await client.query(
        'SELECT * FROM documents WHERE application_id = $1 AND checklist_item_id = $2 FOR UPDATE',
        [application.id, item.id],
      );
      const existing = locked[0];
      checkExisting(existing);

      let document;
      if (!existing) {
        ({ rows: [document] } = await client.query(
          `INSERT INTO documents (application_id, checklist_item_id, file_name, file_path, mime_type, size_bytes, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
           RETURNING *`,
          [application.id, item.id, fileName, storagePath, mimeType, file.size],
        ));
      } else {
        // Replace or resubmit: new current file and version; the old remark belonged to the old file
        // and stays in verification_records.
        ({ rows: [document] } = await client.query(
          `UPDATE documents
              SET file_name = $2, file_path = $3, mime_type = $4, size_bytes = $5, status = 'PENDING',
                  remarks = NULL, current_version = current_version + 1, upload_date = now(), updated_at = now()
            WHERE id = $1
            RETURNING *`,
          [existing.id, fileName, storagePath, mimeType, file.size],
        ));
      }

      await client.query(
        `INSERT INTO document_files (document_id, version, file_name, file_path, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [document.id, document.current_version, fileName, storagePath, mimeType, file.size],
      );
      // MissingDocumentList.recompute() and the application's overall status
      await recomputeApplicationStatus({ applicationId: application.id }, client);

      return {
        action: !existing ? 'UPLOADED' : existing.status === 'REJECTED' ? 'RESUBMITTED' : 'REPLACED',
        documentType: item.document_type,
        documentId: document.id,
        version: document.current_version,
      };
    });
  } catch (err) {
    await removeFile(storagePath).catch(() => {});
    throw err;
  }
}

async function findDocumentForAccess(documentId) {
  const { rows } = await query(
    `SELECT d.*, a.applicant_id, a.application_number, a.category_id, ci.document_type, ci.is_mandatory,
            u.name AS applicant_name
       FROM documents d
       JOIN applications a ON a.id = d.application_id
       JOIN checklist_items ci ON ci.id = d.checklist_item_id
       JOIN users u ON u.id = a.applicant_id
      WHERE d.id = $1`,
    [documentId],
  );
  return rows[0] ?? null;
}

/** NFR-006 / NFR-018: owner, verifiers of the document's category, and administrators only. */
function canAccess(user, doc) {
  if (user.role === ROLES.ADMINISTRATOR) return true;
  if (user.role === ROLES.VERIFIER) return user.assignedCategoryId === doc.category_id;
  return user.role === ROLES.APPLICANT && doc.applicant_id === user.id;
}

async function getAccessibleDocument(user, documentId) {
  const doc = await findDocumentForAccess(documentId);
  // Same answer for "does not exist" and "not yours", so ids cannot be probed.
  if (!doc || !canAccess(user, doc)) throw new AppError(404, 'NOT_FOUND', 'Document not found.');
  return doc;
}

/** Document details with every file version and the verification history (FR-014, FR-020). */
export async function getDocument(user, documentId) {
  const doc = await getAccessibleDocument(user, documentId);
  const [{ rows: versions }, { rows: records }] = await Promise.all([
    query(
      `SELECT version, file_name, mime_type, size_bytes, uploaded_at
         FROM document_files WHERE document_id = $1 ORDER BY version DESC`,
      [doc.id],
    ),
    query(
      `SELECT vr.status, vr.remarks, vr.is_correction, vr.decision_date, u.name AS verifier_name
         FROM verification_records vr JOIN users u ON u.id = vr.verifier_id
        WHERE vr.document_id = $1 ORDER BY vr.decision_date DESC`,
      [doc.id],
    ),
  ]);

  const history = [
    ...versions.map((v) => ({
      type: v.version === 1 ? 'UPLOADED' : 'NEW_VERSION',
      at: v.uploaded_at,
      version: v.version,
      fileName: v.file_name,
    })),
    ...records.map((r) => ({
      type: r.is_correction ? 'CORRECTED' : 'DECISION',
      at: r.decision_date,
      status: r.status,
      remarks: r.remarks,
      by: r.verifier_name,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return {
    id: doc.id,
    documentType: doc.document_type,
    isMandatory: doc.is_mandatory,
    status: doc.status,
    remarks: doc.remarks,
    fileName: doc.file_name,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    currentVersion: doc.current_version,
    uploadDate: doc.upload_date,
    application: { id: doc.application_id, applicationNumber: doc.application_number, applicantName: doc.applicant_name },
    versions: versions.map((v) => ({
      version: v.version,
      fileName: v.file_name,
      mimeType: v.mime_type,
      sizeBytes: v.size_bytes,
      uploadedAt: v.uploaded_at,
    })),
    history,
  };
}

/** DocumentFile.download(): the stored file of the current or a given version. */
export async function getDocumentFile(user, documentId, version) {
  const doc = await getAccessibleDocument(user, documentId);
  const { rows } = await query(
    `SELECT file_name, file_path, mime_type, size_bytes FROM document_files WHERE document_id = $1 AND version = $2`,
    [doc.id, version ?? doc.current_version],
  );
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'That version of the document does not exist.');
  const file = rows[0];
  return { fileName: file.file_name, mimeType: file.mime_type, sizeBytes: file.size_bytes, stream: openFile(file.file_path) };
}
