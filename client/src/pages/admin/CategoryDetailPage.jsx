import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  addChecklistItem,
  fetchCategory,
  removeChecklistItem,
  updateCategory,
  updateChecklistItem,
} from '../../api/categories.js';
import { getApiError } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

// UC-004 Configure Document Checklist (FR-008, FR-009).
export default function CategoryDetailPage() {
  const { id } = useParams();
  const [category, setCategory] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const [details, setDetails] = useState({ name: '', description: '' });
  const [detailFields, setDetailFields] = useState({});
  const [newItem, setNewItem] = useState({ documentType: '', isMandatory: true });
  const [itemFields, setItemFields] = useState({});
  const [editing, setEditing] = useState(null); // { id, documentType }
  const [toRemove, setToRemove] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return fetchCategory(id)
      .then((c) => {
        setCategory(c);
        setDetails({ name: c.name, description: c.description ?? '' });
      })
      .catch((err) => setLoadError(getApiError(err).message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a change, shows its outcome and reloads the checklist. */
  async function run(action, successMessage, onFieldErrors) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
      await load();
      return true;
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.message);
      onFieldErrors?.(apiError.fields);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveDetails(e) {
    e.preventDefault();
    setDetailFields({});
    await run(() => updateCategory(id, details), 'Category details saved.', setDetailFields);
  }

  async function addItem(e) {
    e.preventDefault();
    setItemFields({});
    const ok = await run(
      () => addChecklistItem(id, newItem),
      `${newItem.documentType.trim()} added to the checklist.`,
      setItemFields,
    );
    if (ok) setNewItem({ documentType: '', isMandatory: true });
  }

  function toggleMandatory(item) {
    run(
      () => updateChecklistItem(item.id, { isMandatory: !item.isMandatory }),
      `${item.documentType} is now ${item.isMandatory ? 'optional' : 'mandatory'}.`,
    );
  }

  async function saveRename(e) {
    e.preventDefault();
    const ok = await run(
      () => updateChecklistItem(editing.id, { documentType: editing.documentType }),
      'Document type renamed.',
    );
    if (ok) setEditing(null);
  }

  function confirmRemove() {
    const item = toRemove;
    setToRemove(null);
    run(() => removeChecklistItem(item.id), `${item.documentType} removed from the checklist.`);
  }

  if (loadError) {
    return (
      <section>
        <Link to="/admin/categories">← All categories</Link>
        <div className="alert alert-error">{loadError}</div>
      </section>
    );
  }
  if (!category) return <div className="page-loading">Loading…</div>;

  return (
    <section>
      <Link to="/admin/categories" className="back-link">
        ← All categories
      </Link>
      <h1>
        {category.name} <code className="heading-code">{category.code}</code>
        {!category.isActive && <span className="badge badge-grey heading-badge">Inactive</span>}
      </h1>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-card">
        <div className="card-header">
          <h2>Required documents</h2>
          <span className="muted small">
            Applicants in this category must upload every mandatory document before their application can be completed.
          </span>
        </div>
        {category.checklist.length === 0 ? (
          <div className="empty-state muted">No documents yet. Add the first one below.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Document type</th>
                <th>Mandatory</th>
                <th>Uploads</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {category.checklist.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editing?.id === item.id ? (
                      <form className="inline-form" onSubmit={saveRename}>
                        <input
                          value={editing.documentType}
                          onChange={(e) => setEditing({ ...editing, documentType: e.target.value })}
                          aria-label="Document type"
                          autoFocus
                        />
                        <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
                          Save
                        </button>
                        <button type="button" className="btn btn-link" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      item.documentType
                    )}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={item.isMandatory}
                        aria-label={`${item.documentType} is mandatory`}
                        onChange={() => toggleMandatory(item)}
                        disabled={busy}
                      />
                      <span>{item.isMandatory ? 'Mandatory' : 'Optional'}</span>
                    </label>
                  </td>
                  <td>{item.documentCount}</td>
                  <td className="actions">
                    {editing?.id !== item.id && (
                      <button
                        type="button"
                        className="btn btn-link"
                        onClick={() => setEditing({ id: item.id, documentType: item.documentType })}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-link btn-link-danger"
                      onClick={() => setToRemove(item)}
                      disabled={item.documentCount > 0}
                      title={item.documentCount > 0 ? 'Applicants have uploaded this document; mark it optional instead.' : undefined}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="add-item-form" onSubmit={addItem} noValidate>
          <label className="field grow">
            <span>New document type</span>
            <input
              value={newItem.documentType}
              onChange={(e) => {
                setNewItem({ ...newItem, documentType: e.target.value });
                setItemFields({});
              }}
              placeholder="e.g. Income Certificate"
            />
            {itemFields.documentType && <small className="field-error">{itemFields.documentType}</small>}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={newItem.isMandatory}
              onChange={(e) => setNewItem({ ...newItem, isMandatory: e.target.checked })}
            />
            Mandatory
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Add document
          </button>
        </form>
      </div>

      <form className="card form-card" onSubmit={saveDetails} noValidate>
        <h2>Category details</h2>
        <label className="field">
          <span>Name</span>
          <input value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
          {detailFields.name && <small className="field-error">{detailFields.name}</small>}
        </label>
        <label className="field">
          <span>
            Description <em className="muted">(optional)</em>
          </span>
          <input value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} />
          {detailFields.description && <small className="field-error">{detailFields.description}</small>}
        </label>
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Save details
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(toRemove)}
        title={`Remove ${toRemove?.documentType}?`}
        message="Applicants in this category will no longer be asked for this document."
        confirmLabel="Remove"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setToRemove(null)}
      />
    </section>
  );
}
