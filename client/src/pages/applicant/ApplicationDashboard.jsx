import { useEffect, useState } from 'react';
import { fetchMyApplication } from '../../api/applications.js';
import { getApiError } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

// UC-006 View Missing Documents and UC-007 View Verification Status (FR-010, FR-014, FR-022, FR-023).
export default function ApplicationDashboard() {
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMyApplication()
      .then(setApplication)
      .catch((err) => setError(getApiError(err).message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!application) return <div className="page-loading">Loading…</div>;

  const { progress, missing, checklist } = application;
  const percent = progress.mandatoryTotal ? Math.round((progress.verified / progress.mandatoryTotal) * 100) : 0;

  return (
    <section>
      <h1>My Application</h1>

      <div className="card">
        <div className="summary-grid">
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
            <span className="label">Submitted on</span>
            <strong>{new Date(application.submissionDate).toLocaleDateString()}</strong>
          </div>
        </div>
        {progress.mandatoryTotal > 0 && (
          <div className="progress-block">
            <div className="progress-label">
              <span>
                <strong>{progress.verified}</strong> of {progress.mandatoryTotal} mandatory documents verified
              </span>
              <span className="muted">{progress.uploaded} uploaded</span>
            </div>
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Verified mandatory documents"
            >
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </div>

      {!application.category ? (
        <div className="alert alert-warning">
          Your admission category has not been set yet, so you cannot upload documents. Please contact the admission
          office.
        </div>
      ) : missing.length > 0 ? (
        <div className="card missing-card">
          <h2>Missing documents ({missing.length})</h2>
          <p className="muted">Your application stays incomplete until these are uploaded and verified.</p>
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m.id}>
                <span>{m.documentType}</span>
                {m.status === 'REJECTED' && <StatusBadge status="REJECTED" />}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        application.overallStatus !== 'COMPLETED' && (
          <div className="alert alert-success">All mandatory documents are uploaded. They are now being verified.</div>
        )
      )}

      <div className="card table-card">
        <div className="card-header">
          <h2>Document checklist</h2>
          <span className="muted small">Accepted formats: PDF, JPG or PNG.</span>
        </div>
        {checklist.length === 0 ? (
          <div className="empty-state muted">The admission office has not set up the checklist for your category yet.</div>
        ) : (
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
              {checklist.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.documentType}</strong>
                    {item.document && <div className="muted small">{item.document.fileName}</div>}
                  </td>
                  <td>{item.isMandatory ? 'Mandatory' : 'Optional'}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.document ? new Date(item.document.uploadDate).toLocaleDateString() : '—'}</td>
                  <td className="remarks">{item.document?.remarks || '—'}</td>
                  <td className="actions">
                    {/* Verified documents are final (Document state diagram). */}
                    {item.status !== 'VERIFIED' && (
                      <button type="button" className="btn btn-secondary btn-small" disabled title="Uploads arrive in Increment 3">
                        {item.status === 'REJECTED' ? 'Resubmit' : item.document ? 'Replace' : 'Upload'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
