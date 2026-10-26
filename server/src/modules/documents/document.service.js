// DocumentService (class diagram): checklist view, missing documents and application status.
// Upload arrives in Increment 3.
import { query } from '../../config/db.js';

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

export async function getApplicationForApplicant(applicantId) {
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
  const row = rows[0];
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
  };
}
