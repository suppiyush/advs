import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProgress } from '../../api/admin.js';
import { getApiError } from '../../api/client.js';
import StatusBar from '../../components/StatusBar.jsx';
import { timeAgo } from '../../components/notificationLabels.js';

const ACTIVITY_LABELS = {
  DOCUMENT_VERIFIED: 'verified',
  DOCUMENT_REJECTED: 'rejected',
  REMARK_ADDED: 'added a remark on',
  DECISION_CORRECTED: 'corrected the decision on',
};

// UC-014 View Progress Dashboard (FR-029): overall admission-verification progress.
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProgress()
      .then(setData)
      .catch((err) => setError(getApiError(err).message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="page-loading">Loading…</div>;

  const { applications, documents } = data;
  const completed = applications.byStatus.COMPLETED ?? 0;
  const completedPct = applications.total ? Math.round((completed / applications.total) * 100) : 0;

  return (
    <section>
      <h1>Admission progress</h1>

      <div className="stat-grid">
        <div className="card stat-tile">
          <span className="label">Applications</span>
          <span className="stat-value">{applications.total}</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Completed</span>
          <span className="stat-value">{completed}</span>
          <span className="muted small">{completedPct}% of applications</span>
        </div>
        <div className="card stat-tile">
          <span className="label">Awaiting verification</span>
          <span className="stat-value">{documents.PENDING ?? 0}</span>
          <Link to="/cases" className="small">
            Open pending cases
          </Link>
        </div>
        <div className="card stat-tile">
          <span className="label">Rejected documents</span>
          <span className="stat-value">{documents.REJECTED ?? 0}</span>
          <span className="muted small">waiting for applicants to resubmit</span>
        </div>
      </div>

      <div className="two-column">
        <div className="card">
          <h2>Applications by status</h2>
          <StatusBar counts={applications.byStatus} label="Applications by status" />
        </div>
        <div className="card">
          <h2>Documents by status</h2>
          <StatusBar counts={documents} label="Documents by status" />
        </div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <h2>By category</h2>
          <Link to="/admin/reports" className="small">
            Full reports
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Applications</th>
              <th>Status of applications</th>
              <th className="num">Docs pending</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.id} className={c.isActive ? undefined : 'row-muted'}>
                <td>
                  <strong>{c.name}</strong>
                  <div className="muted small">{c.code}</div>
                </td>
                <td className="num">{c.applications.total}</td>
                <td className="bar-cell">
                  <StatusBar
                    counts={{
                      COMPLETED: c.applications.completed,
                      UNDER_REVIEW: c.applications.underReview,
                      PENDING: c.applications.pending,
                      REJECTED: c.applications.rejected,
                    }}
                    label={`${c.name} applications`}
                  />
                </td>
                <td className="num">{c.documents.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Recent verification activity</h2>
        {data.recentActivity.length === 0 ? (
          <p className="muted">No decisions recorded yet.</p>
        ) : (
          <ol className="history">
            {data.recentActivity.map((a, i) => (
              <li key={i}>
                <span className="history-when small muted">{timeAgo(a.at)}</span>
                <span>
                  <strong>{a.by ?? 'Someone'}</strong> {ACTIVITY_LABELS[a.action] ?? a.action.toLowerCase()}{' '}
                  {a.details?.documentType ?? 'a document'}
                </span>
                {a.details?.remarks && <span className="small history-remark">“{a.details.remarks}”</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
