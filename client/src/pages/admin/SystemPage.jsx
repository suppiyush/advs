import { useEffect, useState } from 'react';
import { fetchAuditLog, fetchSettings, saveSettings } from '../../api/admin.js';
import { getApiError } from '../../api/client.js';

const FORMATS = [
  { mime: 'application/pdf', label: 'PDF' },
  { mime: 'image/jpeg', label: 'JPG' },
  { mime: 'image/png', label: 'PNG' },
];

/** One-line description of an audit entry's details for the table. */
function describe(entry) {
  const d = entry.details ?? {};
  switch (entry.action) {
    case 'USER_CREATED':
      return `${d.email} as ${d.role?.toLowerCase()}`;
    case 'USER_UPDATED':
      return `${d.email}: ${Object.keys(d.changes ?? {}).join(', ')}`;
    case 'CATEGORY_CREATED':
      return `${d.name} (${d.code})`;
    case 'CHECKLIST_ITEM_ADDED':
    case 'CHECKLIST_ITEM_REMOVED':
      return d.documentType;
    case 'DOCUMENT_VERIFIED':
    case 'DOCUMENT_REJECTED':
    case 'REMARK_ADDED':
      return [d.documentType, d.remarks && `“${d.remarks}”`].filter(Boolean).join(' ');
    case 'DECISION_CORRECTED':
      return `${d.documentType}: ${d.from} → ${d.to} (“${d.reason}”)`;
    case 'REMINDER_SENT':
      return `${d.missing?.length ?? 0} missing document(s)`;
    case 'SETTINGS_UPDATED':
      return Object.keys(d.changes ?? {}).join(', ');
    default:
      return `${entry.entityType ?? ''} ${entry.entityId ?? ''}`.trim();
  }
}

// Manage System Configuration: settings (FR-034) and audit log (FR-035).
export default function SystemPage() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState(null);
  const [settingsError, setSettingsError] = useState(null);
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);

  const [filters, setFilters] = useState({ action: '', from: '', to: '', page: 1 });
  const [log, setLog] = useState(null);
  const [logError, setLogError] = useState(null);

  function show(s) {
    setSettings(s);
    setForm({ registrationOpen: s.registrationOpen, maxUploadMb: String(s.maxUploadMb), allowedMimeTypes: s.allowedMimeTypes });
  }

  useEffect(() => {
    fetchSettings()
      .then(show)
      .catch((err) => setSettingsError(getApiError(err).message));
  }, []);

  useEffect(() => {
    const params = { page: filters.page };
    for (const key of ['action', 'from', 'to']) if (filters[key]) params[key] = filters[key];
    fetchAuditLog(params)
      .then(setLog)
      .catch((err) => setLogError(getApiError(err).message));
  }, [filters, settings]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setSettingsError(null);
    setSettingsMessage(null);
    setFields({});
    // Send only what changed, so the audit log records exactly that.
    const next = { ...form, maxUploadMb: Number(form.maxUploadMb) };
    const changes = Object.fromEntries(
      Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(settings[key])),
    );
    if (Object.keys(changes).length === 0) {
      setSaving(false);
      setSettingsMessage('Nothing changed.');
      return;
    }
    try {
      show(await saveSettings(changes));
      setSettingsMessage('Settings saved. They apply immediately.');
    } catch (err) {
      const apiError = getApiError(err);
      setSettingsError(apiError.message);
      setFields(apiError.fields ?? {});
    } finally {
      setSaving(false);
    }
  }

  function toggleFormat(mime) {
    const set = new Set(form.allowedMimeTypes);
    if (set.has(mime)) set.delete(mime);
    else set.add(mime);
    setForm({ ...form, allowedMimeTypes: FORMATS.map((f) => f.mime).filter((m) => set.has(m)) });
  }

  const pages = log ? Math.max(1, Math.ceil(log.total / log.pageSize)) : 1;
  const setFilter = (changes) => setFilters({ ...filters, ...changes, page: changes.page ?? 1 });

  return (
    <section>
      <h1>System Configuration</h1>

      {settingsMessage && (
        <div className="alert alert-success" role="status">
          {settingsMessage}
        </div>
      )}
      {settingsError && <div className="alert alert-error">{settingsError}</div>}

      {form && (
        <form className="card form-card" onSubmit={submit} noValidate>
          <h2>Settings</h2>
          <label className="checkbox">
            <input type="checkbox" checked={form.registrationOpen} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} />
            Applicant registration is open
          </label>
          <div className="form-row">
            <label className="field">
              <span>Maximum upload size (MB)</span>
              <input type="number" min={1} max={20} value={form.maxUploadMb} onChange={(e) => setForm({ ...form, maxUploadMb: e.target.value })} />
              {fields.maxUploadMb && <small className="field-error">{fields.maxUploadMb}</small>}
            </label>
            <fieldset className="field fieldset">
              <legend>Accepted file formats</legend>
              <div className="inline-checks">
                {FORMATS.map((f) => (
                  <label key={f.mime} className="checkbox">
                    <input type="checkbox" checked={form.allowedMimeTypes.includes(f.mime)} onChange={() => toggleFormat(f.mime)} />
                    {f.label}
                  </label>
                ))}
              </div>
              {fields.allowedMimeTypes && <small className="field-error">{fields.allowedMimeTypes}</small>}
            </fieldset>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            {settings?.updatedAt && <span className="muted small">Last changed {new Date(settings.updatedAt).toLocaleString()}</span>}
          </div>
        </form>
      )}

      <div className="card table-card">
        <div className="card-header">
          <h2>Audit log</h2>
          {log && <span className="muted small">{log.total} entries</span>}
        </div>
        <div className="audit-filters">
          <select aria-label="Filter by action" value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
            <option value="">All actions</option>
            {log?.actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, ' ').toLowerCase()}
              </option>
            ))}
          </select>
          <label>
            From <input type="date" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
          </label>
          <label>
            To <input type="date" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
          </label>
        </div>
        {logError && <div className="alert alert-error">{logError}</div>}
        {!log ? (
          <div className="page-loading">Loading…</div>
        ) : log.entries.length === 0 ? (
          <div className="empty-state muted">No entries match.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {log.entries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap small">{new Date(e.createdAt).toLocaleString()}</td>
                  <td>{e.actor?.name ?? <span className="muted">deleted user</span>}</td>
                  <td>
                    <code>{e.action}</code>
                  </td>
                  <td className="small audit-details">{describe(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {log && pages > 1 && (
          <div className="pager">
            <button type="button" className="btn btn-secondary btn-small" disabled={filters.page <= 1} onClick={() => setFilter({ page: filters.page - 1 })}>
              Previous
            </button>
            <span className="small muted">
              Page {filters.page} of {pages}
            </span>
            <button type="button" className="btn btn-secondary btn-small" disabled={filters.page >= pages} onClick={() => setFilter({ page: filters.page + 1 })}>
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
