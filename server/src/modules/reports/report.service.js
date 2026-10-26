// ReportService (class diagram): generateSummary(), getVerificationReport(); FR-029-031, BR-010.
import { query } from '../../config/db.js';

const toCounts = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], Number(r.count)]));

const TREND_DAYS = 14;

/** Daily registrations, uploads and decisions for the last 14 days, in Indian Standard Time. */
async function getDailyTrend() {
  const { rows } = await query(
    `WITH days AS (
       SELECT generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - ${TREND_DAYS - 1},
                              (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day')::date AS day
     )
     SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            (SELECT count(*) FROM applications a
              WHERE (a.submission_date AT TIME ZONE 'Asia/Kolkata')::date = d.day) AS registrations,
            (SELECT count(*) FROM document_files f
              WHERE (f.uploaded_at AT TIME ZONE 'Asia/Kolkata')::date = d.day) AS uploads,
            (SELECT count(*) FROM verification_records v
              WHERE NOT v.is_correction AND (v.decision_date AT TIME ZONE 'Asia/Kolkata')::date = d.day) AS decisions
       FROM days d
      ORDER BY d.day`,
  );
  return rows.map((r) => ({
    day: r.day,
    registrations: Number(r.registrations),
    uploads: Number(r.uploads),
    decisions: Number(r.decisions),
  }));
}

/** Things an administrator should act on. */
async function getAlerts() {
  const [{ rows: uncovered }, { rows: settings }] = await Promise.all([
    query(
      `SELECT c.id, c.name,
              (SELECT count(*) FROM applications a WHERE a.category_id = c.id) AS applications,
              (SELECT count(*) FROM documents d JOIN applications a ON a.id = d.application_id
                WHERE a.category_id = c.id AND d.status = 'PENDING') AS pending
         FROM categories c
        WHERE c.is_active
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'VERIFIER' AND u.is_active AND u.assigned_category_id = c.id)
          AND EXISTS (SELECT 1 FROM applications a WHERE a.category_id = c.id)
        ORDER BY c.name`,
    ),
    query(`SELECT value FROM system_settings WHERE key = 'registration_open'`),
  ]);
  const alerts = uncovered.map((c) => ({
    type: 'NO_VERIFIER',
    severity: Number(c.pending) > 0 ? 'critical' : 'warning',
    categoryId: c.id,
    message:
      Number(c.pending) > 0
        ? `${c.name}: ${c.pending} document(s) waiting, but no active verifier is assigned to this category.`
        : `${c.name}: ${c.applications} applicant(s), but no active verifier is assigned yet.`,
  }));
  if (settings[0] && settings[0].value === false) {
    alerts.push({ type: 'REGISTRATION_CLOSED', severity: 'info', message: 'Applicant registration is closed.' });
  }
  return alerts;
}

/** FR-029: aggregated application progress (the administrator's dashboard). */
export async function generateSummary() {
  const [trend, alerts] = await Promise.all([getDailyTrend(), getAlerts()]);
  const [apps, docs, recent] = await Promise.all([
    query('SELECT overall_status, count(*) FROM applications GROUP BY overall_status'),
    query('SELECT status, count(*) FROM documents GROUP BY status'),
    query(
      `SELECT l.action, l.created_at, l.details, u.name AS actor_name
         FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
        WHERE l.entity_type = 'document'
          -- only documents that still exist; the full audit log keeps everything
          AND EXISTS (SELECT 1 FROM documents d WHERE d.id::text = l.entity_id)
        ORDER BY l.created_at DESC LIMIT 10`,
    ),
  ]);
  const applications = toCounts(apps.rows, 'overall_status');
  return {
    applications: { total: Object.values(applications).reduce((a, b) => a + b, 0), byStatus: applications },
    documents: toCounts(docs.rows, 'status'),
    categories: await getCategorySummary(),
    recentActivity: recent.rows.map((r) => ({ action: r.action, at: r.created_at, by: r.actor_name, details: r.details })),
    trend,
    alerts,
  };
}

/** FR-031: per category, applications by status and documents by status. */
export async function getCategorySummary() {
  const { rows } = await query(
    `SELECT c.id, c.code, c.name, c.is_active,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id) AS applications,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id AND a.overall_status = 'COMPLETED') AS completed,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id AND a.overall_status = 'UNDER_REVIEW') AS under_review,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id AND a.overall_status = 'REJECTED') AS rejected,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id AND a.overall_status = 'PENDING') AS pending,
            (SELECT count(*) FROM documents d JOIN applications a ON a.id = d.application_id
              WHERE a.category_id = c.id AND d.status = 'PENDING') AS documents_pending,
            (SELECT count(*) FROM documents d JOIN applications a ON a.id = d.application_id
              WHERE a.category_id = c.id AND d.status = 'VERIFIED') AS documents_verified,
            (SELECT count(*) FROM documents d JOIN applications a ON a.id = d.application_id
              WHERE a.category_id = c.id AND d.status = 'REJECTED') AS documents_rejected
       FROM categories c
      ORDER BY c.name`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    isActive: r.is_active,
    applications: {
      total: Number(r.applications),
      completed: Number(r.completed),
      underReview: Number(r.under_review),
      rejected: Number(r.rejected),
      pending: Number(r.pending),
    },
    documents: { pending: Number(r.documents_pending), verified: Number(r.documents_verified), rejected: Number(r.documents_rejected) },
  }));
}

/** FR-030: verification activity per verifier in a date range (inclusive). */
export async function getVerificationReport({ from, to }) {
  const { rows } = await query(
    `SELECT u.id, u.name,
            count(*) FILTER (WHERE vr.status = 'VERIFIED' AND NOT vr.is_correction) AS verified,
            count(*) FILTER (WHERE vr.status = 'REJECTED' AND NOT vr.is_correction) AS rejected,
            count(*) FILTER (WHERE vr.status = 'PENDING' AND NOT vr.is_correction) AS remarks,
            count(*) FILTER (WHERE vr.is_correction) AS corrections
       FROM verification_records vr
       JOIN users u ON u.id = vr.verifier_id
      WHERE vr.decision_date >= $1 AND vr.decision_date < $2::date + 1
      GROUP BY u.id, u.name
      ORDER BY u.name`,
    [from, to],
  );
  return {
    from,
    to,
    verifiers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      verified: Number(r.verified),
      rejected: Number(r.rejected),
      remarks: Number(r.remarks),
      corrections: Number(r.corrections),
    })),
  };
}
