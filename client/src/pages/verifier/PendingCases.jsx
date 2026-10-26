import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getApiError } from '../../api/client.js';
import { fetchPendingCases, fetchStaffApplications } from '../../api/verification.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function waitingFor(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days < 1) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

// UC-008 View Pending Cases Dashboard (FR-016, FR-028): pending documents oldest first, plus an
// applicants view ("view list of pending documents / applicants" in the UC-009 activity diagram).
export default function PendingCases() {
  const { user } = useAuth();
  const isAdmin = user.role === 'ADMINISTRATOR';
  const location = useLocation();
  const [message] = useState(location.state?.message ?? null);

  const [tab, setTab] = useState('documents');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null);
  const [applications, setApplications] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (location.state?.message) window.history.replaceState({}, '');
  }, [location.state]);

  // Search as the user types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const params = query ? { search: query } : undefined;
    setError(null);
    const request =
      tab === 'documents'
        ? fetchPendingCases(params).then(setPending)
        : fetchStaffApplications(params).then(setApplications);
    request.catch((err) => setError(getApiError(err).message));
  }, [tab, query]);

  const cases = pending?.cases ?? [];

  return (
    <section>
      <h1>{isAdmin ? 'Verification' : 'Pending Cases'}</h1>
      <p className="muted">
        {isAdmin
          ? 'Documents awaiting verification in every category. Only verifiers record decisions; you can correct a recorded decision from a document’s page.'
          : 'Documents awaiting your verification, oldest upload first.'}
      </p>

      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}
      {pending?.noCategoryAssigned && (
        <div className="alert alert-warning">
          You have not been assigned an admission category yet, so there is nothing to verify. Please ask an
          administrator.
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'documents'}
            className={`tab${tab === 'documents' ? ' active' : ''}`}
            onClick={() => setTab('documents')}
          >
            Pending documents{pending ? ` (${cases.length})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'applicants'}
            className={`tab${tab === 'applicants' ? ' active' : ''}`}
            onClick={() => setTab('applicants')}
          >
            Applicants
          </button>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder="Search applicant or application number"
          aria-label="Search applicant or application number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tab === 'documents' ? (
        <div className="card table-card">
          {!pending ? (
            <div className="page-loading">Loading…</div>
          ) : cases.length === 0 ? (
            // UC-008 exception flow: empty state
            <div className="empty-state">
              <h2>{query ? 'No matching documents' : 'All caught up'}</h2>
              <p className="muted">
                {query ? 'No pending document matches your search.' : 'There are no documents waiting for verification.'}
              </p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Uploaded</th>
                  <th>Applicant</th>
                  {isAdmin && <th>Category</th>}
                  <th>Document</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.documentId}>
                    <td>
                      {new Date(c.uploadDate).toLocaleDateString()}
                      <div className="muted small">waiting {waitingFor(c.uploadDate)}</div>
                    </td>
                    <td>
                      <Link to={`/cases/applications/${c.application.id}`}>{c.application.applicantName}</Link>
                      <div className="muted small">{c.application.applicationNumber}</div>
                    </td>
                    {isAdmin && <td>{c.category.name}</td>}
                    <td>
                      <strong>{c.documentType}</strong>
                      {c.version > 1 && <span className="badge badge-blue inline-badge">v{c.version}</span>}
                      {c.remarks && <div className="muted small">Remark sent: {c.remarks}</div>}
                    </td>
                    <td className="actions">
                      <Link to={`/cases/documents/${c.documentId}`} className="btn btn-primary btn-small">
                        {isAdmin ? 'Open' : 'Review'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card table-card">
          {!applications ? (
            <div className="page-loading">Loading…</div>
          ) : applications.length === 0 ? (
            <div className="empty-state muted">No applications found.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  {isAdmin && <th>Category</th>}
                  <th>Status</th>
                  <th>Documents</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.applicantName}</strong>
                      <div className="muted small">{a.applicationNumber}</div>
                    </td>
                    {isAdmin && <td>{a.categoryName}</td>}
                    <td>
                      <StatusBadge status={a.overallStatus} />
                    </td>
                    <td className="small">
                      {a.counts.pending > 0 && <strong>{a.counts.pending} pending · </strong>}
                      {a.counts.verified} of {a.counts.mandatoryTotal} verified
                      {a.counts.rejected > 0 && ` · ${a.counts.rejected} rejected`}
                    </td>
                    <td className="actions">
                      <Link to={`/cases/applications/${a.id}`} className="btn btn-secondary btn-small">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
