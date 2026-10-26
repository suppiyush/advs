import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { documentFileUrl, fetchDocument } from '../../api/applications.js';
import { getApiError } from '../../api/client.js';
import { correctDecision, recordDecision } from '../../api/verification.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const DECISIONS = [
  { status: 'VERIFIED', label: 'Verify', hint: 'The document is correct and readable.' },
  { status: 'REJECTED', label: 'Reject', hint: 'The applicant must upload it again. A reason is required.' },
  { status: 'PENDING', label: 'Keep pending', hint: 'Ask the applicant for something without rejecting.' },
];

const HISTORY_LABELS = {
  UPLOADED: 'Uploaded',
  NEW_VERSION: 'New version uploaded',
  DECISION: 'Decision',
  CORRECTED: 'Corrected by administrator',
};

function DocumentPreview({ document }) {
  const url = documentFileUrl(document.id, document.currentVersion);
  if (document.mimeType === 'application/pdf') {
    return <iframe className="preview-frame" src={url} title={`Preview of ${document.fileName}`} />;
  }
  return (
    <div className="preview-image">
      <img src={url} alt={`${document.documentType} uploaded by the applicant`} />
    </div>
  );
}

// UC-009 Verify Document / UC-010 Reject / UC-011 Add Remarks, following the activity diagram:
// display document details and file -> review -> update status -> remarks -> back to pending list.
export default function ReviewDocument() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isVerifier = user.role === 'VERIFIER';

  const [document, setDocument] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [decision, setDecision] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState(null);
  const [fieldError, setFieldError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState({ status: '', reason: '' });
  const [correctionMessage, setCorrectionMessage] = useState(null);

  const load = useCallback(
    () =>
      fetchDocument(id)
        .then(setDocument)
        .catch((err) => setLoadError(getApiError(err).message)),
    [id],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function submitDecision(e) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!decision) {
      setError('Choose Verify, Reject or Keep pending.');
      return;
    }
    if (decision !== 'VERIFIED' && !remarks.trim()) {
      setFieldError(decision === 'REJECTED' ? 'Enter the reason for rejecting this document.' : 'Enter a remark for the applicant.');
      return;
    }
    setSaving(true);
    try {
      const result = await recordDecision(document.id, { status: decision, remarks, version: document.currentVersion });
      const verb = { VERIFIED: 'verified', REJECTED: 'rejected', PENDING: 'kept pending with your remark' }[result.status];
      navigate('/cases', {
        replace: true,
        state: { message: `${result.documentType} for ${document.application.applicantName} ${verb}.` },
      });
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.message);
      setFieldError(apiError.fields?.remarks ?? null);
      // Someone else decided, or a new file arrived: show the current state.
      if (err?.response?.status === 409) {
        setDecision(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitCorrection(e) {
    e.preventDefault();
    setError(null);
    setCorrectionMessage(null);
    setSaving(true);
    try {
      await correctDecision(document.id, correction);
      setCorrection({ status: '', reason: '' });
      setCorrectionMessage('Status corrected.');
      await load();
    } catch (err) {
      setError(getApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <section>
        <Link to="/cases" className="back-link">
          ← Pending cases
        </Link>
        <div className="alert alert-error">{loadError}</div>
      </section>
    );
  }
  if (!document) return <div className="page-loading">Loading…</div>;

  const canDecide = isVerifier && document.status === 'PENDING';
  const canCorrect = user.role === 'ADMINISTRATOR' && document.status !== 'PENDING';

  return (
    <section>
      <Link to="/cases" className="back-link">
        ← Pending cases
      </Link>
      <h1>
        {document.documentType} <StatusBadge status={document.status} />
      </h1>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      {correctionMessage && <div className="alert alert-success">{correctionMessage}</div>}

      <div className="review-layout">
        <div className="card preview-card">
          <DocumentPreview document={document} />
          <div className="preview-footer small">
            <span>
              {document.fileName} · version {document.currentVersion}
            </span>
            <a href={documentFileUrl(document.id, document.currentVersion)} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          </div>
        </div>

        <div className="review-side">
          <div className="card">
            <h2>Applicant</h2>
            <dl className="details">
              <dt>Name</dt>
              <dd>{document.application.applicantName}</dd>
              <dt>Application</dt>
              <dd>
                <Link to={`/cases/applications/${document.application.id}`}>{document.application.applicationNumber}</Link>
              </dd>
              <dt>Required</dt>
              <dd>{document.isMandatory ? 'Mandatory' : 'Optional'}</dd>
              <dt>Uploaded</dt>
              <dd>{new Date(document.uploadDate).toLocaleString()}</dd>
            </dl>
            {document.remarks && (
              <p className="current-remark small">
                <strong>Current remark:</strong> {document.remarks}
              </p>
            )}
          </div>

          {canDecide && (
            <form className="card form-card" onSubmit={submitDecision} noValidate>
              <h2>Your decision</h2>
              <div className="decision-options" role="radiogroup" aria-label="Decision">
                {DECISIONS.map((d) => (
                  <label key={d.status} className={`decision-option decision-${d.status.toLowerCase()}${decision === d.status ? ' selected' : ''}`}>
                    <input
                      type="radio"
                      name="decision"
                      value={d.status}
                      checked={decision === d.status}
                      onChange={() => {
                        setDecision(d.status);
                        setFieldError(null);
                      }}
                    />
                    <span>
                      <strong>{d.label}</strong>
                      <small className="muted">{d.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
              <label className="field">
                <span>
                  Remarks{' '}
                  {decision && decision !== 'VERIFIED' ? (
                    <em className="field-required">(required)</em>
                  ) : (
                    <em className="muted">(optional)</em>
                  )}
                </span>
                <textarea
                  rows={3}
                  value={remarks}
                  maxLength={500}
                  onChange={(e) => {
                    setRemarks(e.target.value);
                    setFieldError(null);
                  }}
                  placeholder={decision === 'REJECTED' ? 'e.g. The scan is blurred; please upload a clearer copy.' : ''}
                />
                {fieldError && <small className="field-error">{fieldError}</small>}
                <small className="muted">The applicant sees this remark.</small>
              </label>
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save decision'}
                </button>
              </div>
            </form>
          )}

          {isVerifier && document.status !== 'PENDING' && (
            <div className="alert alert-warning">This document has already been decided. Only an administrator can correct it.</div>
          )}

          {user.role === 'ADMINISTRATOR' && document.status === 'PENDING' && (
            <div className="alert alert-warning">Only verifiers record decisions on pending documents.</div>
          )}

          {canCorrect && (
            <form className="card form-card" onSubmit={submitCorrection} noValidate>
              <h2>Correct the decision</h2>
              <p className="muted small">Use this to fix a mistaken decision. The applicant sees the new status.</p>
              <label className="field">
                <span>New status</span>
                <select value={correction.status} onChange={(e) => setCorrection({ ...correction, status: e.target.value })}>
                  <option value="">Choose…</option>
                  {['VERIFIED', 'REJECTED', 'PENDING']
                    .filter((s) => s !== document.status)
                    .map((s) => (
                      <option key={s} value={s}>
                        {s === 'PENDING' ? 'Pending (review again)' : s.charAt(0) + s.slice(1).toLowerCase()}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>
                  Reason <em className="field-required">(required)</em>
                </span>
                <textarea rows={2} value={correction.reason} onChange={(e) => setCorrection({ ...correction, reason: e.target.value })} />
              </label>
              <div>
                <button type="submit" className="btn btn-primary" disabled={saving || !correction.status || correction.reason.trim().length < 5}>
                  Save correction
                </button>
              </div>
            </form>
          )}

          <div className="card">
            <h2>History</h2>
            <ol className="history">
              {document.history.map((h, i) => (
                <li key={i}>
                  <span className="history-when small muted">{new Date(h.at).toLocaleString()}</span>
                  <span>
                    {HISTORY_LABELS[h.type]}
                    {h.version && ` (v${h.version})`}
                    {h.status && (
                      <>
                        {' '}
                        <StatusBadge status={h.status} />
                      </>
                    )}
                    {h.by && <span className="muted"> by {h.by}</span>}
                  </span>
                  {h.remarks && <span className="small history-remark">“{h.remarks}”</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
