import { useEffect, useState } from 'react';
import { api, getApiError } from '../../api/client.js';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function ApplicationDashboard() {
  const [application, setApplication] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/applications/me')
      .then(({ data }) => setApplication(data.application))
      .catch((err) => setError(getApiError(err).message));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!application) return <div className="page-loading">Loading…</div>;

  return (
    <section>
      <h1>My Application</h1>
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
          <span className="label">Submitted on</span>
          <strong>{new Date(application.submissionDate).toLocaleDateString()}</strong>
        </div>
      </div>

      <div className="card empty-state">
        <h2>Document checklist</h2>
        <p className="muted">Your document checklist and uploads will appear here (Increments 2-3).</p>
      </div>
    </section>
  );
}
