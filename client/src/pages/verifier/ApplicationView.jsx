import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getApiError } from '../../api/client.js';
import { fetchStaffApplication } from '../../api/verification.js';
import StatusBadge from '../../components/StatusBadge.jsx';

// One applicant's application for staff: details, missing documents and every checklist item.
export default function ApplicationView() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStaffApplication(id)
      .then(setApplication)
      .catch((err) => setError(getApiError(err).message));
  }, [id]);

  if (error) {
    return (
      <section>
        <Link to="/cases" className="back-link">
          ← Pending cases
        </Link>
        <div className="alert alert-error">{error}</div>
      </section>
    );
  }
  if (!application) return <div className="page-loading">Loading…</div>;

  const { applicant } = application;

  return (
    <section>
      <Link to="/cases" className="back-link">
        ← Pending cases
      </Link>
      <h1>{applicant.name}</h1>

      <div className="card summary-grid">
        <div>
          <span className="label">Application number</span>
          <strong>{application.applicationNumber}</strong>
        </div>
        <div>
          <span className="label">Category</span>
          <strong>{application.category?.name ?? 'Not assigned'}</strong>
        </div>
        <div>
          <span className="label">Overall status</span>
          <StatusBadge status={application.overallStatus} />
        </div>
        <div>
          <span className="label">Contact</span>
          <span>
            <a href={`mailto:${applicant.email}`}>{applicant.email}</a>
            {applicant.phone && <div className="small">{applicant.phone}</div>}
          </span>
        </div>
      </div>

      {application.missing.length > 0 && (
        <div className="card missing-card">
          <h2>Missing documents ({application.missing.length})</h2>
          <ul className="missing-list">
            {application.missing.map((m) => (
              <li key={m.id}>
                <span>{m.documentType}</span>
                {m.status === 'REJECTED' && <StatusBadge status="REJECTED" />}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card table-card">
        <div className="card-header">
          <h2>Documents</h2>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Required</th>
              <th>Status</th>
              <th>Uploaded on</th>
              <th>Remarks</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {application.checklist.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.documentType}</strong>
                  {item.document && item.document.currentVersion > 1 && (
                    <span className="badge badge-blue inline-badge">v{item.document.currentVersion}</span>
                  )}
                </td>
                <td>{item.isMandatory ? 'Mandatory' : 'Optional'}</td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.document ? new Date(item.document.uploadDate).toLocaleDateString() : '—'}</td>
                <td className="remarks">{item.document?.remarks || '—'}</td>
                <td className="actions">
                  {item.document && (
                    <Link
                      to={`/cases/documents/${item.document.id}`}
                      className={`btn btn-small ${item.status === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {item.status === 'PENDING' ? 'Review' : 'Open'}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
