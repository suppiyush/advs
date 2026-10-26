import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { documentFileUrl, fetchDocument, fetchMyApplication, uploadDocument } from '../../api/applications.js';
import { getApiError } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

const ACTION_MESSAGES = {
  UPLOADED: 'uploaded',
  REPLACED: 'replaced',
  RESUBMITTED: 'resubmitted',
};

/** ['PDF', 'JPG', 'PNG'] -> "PDF, JPG or PNG" */
function orList(items) {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} or ${items.at(-1)}` : (items[0] ?? '');
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// UC-005 Upload Document / UC-012 Resubmit Document, following the activity diagram:
// select document type -> upload form -> validate -> save -> success -> updated status.
export default function UploadDocument() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [item, setItem] = useState(null);
  const [rules, setRules] = useState(null);
  const [details, setDetails] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    fetchMyApplication()
      .then(async (application) => {
        const found = application.checklist.find((i) => String(i.id) === itemId);
        if (!found) {
          setLoadError('This document is not on the checklist for your category.');
          return;
        }
        setItem(found);
        setRules(application.uploadRules);
        if (found.document) setDetails(await fetchDocument(found.document.id));
      })
      .catch((err) => setLoadError(getApiError(err).message));
  }, [itemId]);

  /** Quick check in the browser (NFR-010); the server checks the real file type again. */
  function chooseFile(e) {
    const chosen = e.target.files[0] ?? null;
    setError(null);
    setFileError(null);
    setFile(chosen);
    if (!chosen) return;
    if (!rules.allowedMimeTypes.includes(chosen.type)) {
      setFileError(`Please choose a ${orList(rules.allowedFormats)} file.`);
    } else if (chosen.size > rules.maxUploadMb * 1024 * 1024) {
      setFileError(`This file is ${formatSize(chosen.size)}. The maximum size is ${rules.maxUploadMb} MB.`);
    } else if (chosen.size === 0) {
      setFileError('This file is empty.');
    }
  }

  async function send(confirmReplace) {
    setConfirmOpen(false);
    setError(null);
    setProgress(0);
    try {
      const { result } = await uploadDocument(item.id, file, { confirmReplace, onProgress: setProgress });
      navigate('/applicant', {
        replace: true,
        state: { message: `${result.documentType} ${ACTION_MESSAGES[result.action]} successfully. It is now awaiting verification.` },
      });
    } catch (err) {
      setProgress(null);
      const code = err?.response?.data?.error?.code;
      if (code === 'CONFIRM_REPLACE') {
        setConfirmOpen(true); // status changed since the page loaded
        return;
      }
      const apiError = getApiError(err);
      setError(apiError.fields?.file ?? apiError.message);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!file) {
      setFileError('Choose a file to upload.');
      return;
    }
    if (fileError) return;
    // UC-005 alternative flow: replacing a document that is still awaiting verification needs confirmation.
    if (item.status === 'PENDING') setConfirmOpen(true);
    else send(false);
  }

  if (loadError) {
    return (
      <section>
        <Link to="/applicant" className="back-link">
          ← My Application
        </Link>
        <div className="alert alert-error">{loadError}</div>
      </section>
    );
  }
  if (!item) return <div className="page-loading">Loading…</div>;

  const uploading = progress !== null;
  const verb = item.status === 'REJECTED' ? 'Resubmit' : item.document ? 'Replace' : 'Upload';

  return (
    <section>
      <Link to="/applicant" className="back-link">
        ← My Application
      </Link>
      <h1>{item.status === 'VERIFIED' ? item.documentType : `${verb} ${item.documentType}`}</h1>

      <div className="card">
        <div className="summary-grid">
          <div>
            <span className="label">Required</span>
            <strong>{item.isMandatory ? 'Mandatory' : 'Optional'}</strong>
          </div>
          <div>
            <span className="label">Current status</span>
            <StatusBadge status={item.status} />
          </div>
          {item.document && (
            <div>
              <span className="label">Current file</span>
              <a href={documentFileUrl(item.document.id)} target="_blank" rel="noreferrer">
                {item.document.fileName}
              </a>
            </div>
          )}
        </div>
        {item.status === 'REJECTED' && item.document.remarks && (
          <div className="alert alert-error remark-box">
            <strong>Reason for rejection:</strong> {item.document.remarks}
          </div>
        )}
      </div>

      {item.status === 'VERIFIED' ? (
        <div className="alert alert-success">This document has been verified. It can no longer be changed.</div>
      ) : (
        <form className="card form-card" onSubmit={handleSubmit} noValidate>
          <h2>Choose a file</h2>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <label className={`dropzone${file && !fileError ? ' has-file' : ''}`}>
            <input
              ref={inputRef}
              type="file"
              accept={rules.allowedMimeTypes.join(',')}
              onChange={chooseFile}
              disabled={uploading}
            />
            {file ? (
              <span>
                <strong>{file.name}</strong> <span className="muted">({formatSize(file.size)})</span>
              </span>
            ) : (
              <span>Click to choose a file</span>
            )}
            <small className="muted">
              {rules.allowedFormats.join(', ')} · up to {rules.maxUploadMb} MB
            </small>
          </label>
          {fileError && <small className="field-error">{fileError}</small>}

          {uploading && (
            <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-fill progress-fill-blue" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={uploading || !file || Boolean(fileError)}>
              {uploading ? `Uploading… ${progress}%` : verb}
            </button>
            <Link to="/applicant" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </form>
      )}

      {details && details.versions.length > 0 && (
        <div className="card table-card">
          <div className="card-header">
            <h2>Previous uploads</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Version</th>
                <th>File</th>
                <th>Size</th>
                <th>Uploaded on</th>
              </tr>
            </thead>
            <tbody>
              {details.versions.map((v) => (
                <tr key={v.version}>
                  <td>
                    v{v.version}
                    {v.version === details.currentVersion && <span className="muted small"> (current)</span>}
                  </td>
                  <td>
                    <a href={documentFileUrl(details.id, v.version)} target="_blank" rel="noreferrer">
                      {v.fileName}
                    </a>
                  </td>
                  <td>{formatSize(v.sizeBytes)}</td>
                  <td>{new Date(v.uploadedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Replace ${item.documentType}?`}
        message="Your current file is still awaiting verification. The new file will replace it and verification will start again. The old file is kept in your upload history."
        confirmLabel="Replace file"
        onConfirm={() => send(true)}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
