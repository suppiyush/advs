// DocumentService (class diagram). Increment 1 only exposes the applicant's application summary;
// checklist, upload and missing-document logic arrive in Increments 2-3.
import { query } from '../../config/db.js';

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
  return {
    id: row.id,
    applicationNumber: row.application_number,
    overallStatus: row.overall_status,
    submissionDate: row.submission_date,
    category: row.category_id ? { id: row.category_id, code: row.category_code, name: row.category_name } : null,
  };
}
