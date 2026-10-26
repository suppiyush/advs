import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCategory, fetchAllCategories, updateCategory } from '../../api/categories.js';
import { getApiError } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';

const EMPTY = { code: 'CAT-', name: '', description: '' };

export default function CategoriesPage() {
  const [categories, setCategories] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState(null);
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [toDeactivate, setToDeactivate] = useState(null);

  function load() {
    fetchAllCategories()
      .then(setCategories)
      .catch((err) => setLoadError(getApiError(err).message));
  }

  useEffect(load, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFields({ ...fields, [e.target.name]: undefined });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setMessage(null);
    try {
      const created = await createCategory(form);
      setForm(EMPTY);
      setMessage(`Category ${created.name} (${created.code}) created. Add its checklist next.`);
      load();
    } catch (err) {
      const apiError = getApiError(err);
      setFormError(apiError.message);
      setFields(apiError.fields);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(category, isActive) {
    setToDeactivate(null);
    setMessage(null);
    try {
      await updateCategory(category.id, { isActive });
      setMessage(`${category.name} is now ${isActive ? 'active' : 'inactive'}.`);
      load();
    } catch (err) {
      setLoadError(getApiError(err).message);
    }
  }

  const fieldError = (name) => fields[name] && <small className="field-error">{fields[name]}</small>;

  return (
    <section>
      <h1>Categories &amp; Checklists</h1>
      <p className="muted">
        Each admission category has its own list of required documents. Applicants choose their category when they
        register.
      </p>

      {message && <div className="alert alert-success">{message}</div>}
      {loadError && <div className="alert alert-error">{loadError}</div>}

      <div className="card table-card">
        {!categories ? (
          <div className="page-loading">Loading…</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Checklist</th>
                <th>Applications</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className={c.isActive ? undefined : 'row-muted'}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>
                    <strong>{c.name}</strong>
                    {c.description && <div className="muted small">{c.description}</div>}
                  </td>
                  <td>
                    {c.itemCount === 0 ? (
                      <span className="badge badge-amber">No items yet</span>
                    ) : (
                      `${c.itemCount} item${c.itemCount === 1 ? '' : 's'} (${c.mandatoryCount} mandatory)`
                    )}
                  </td>
                  <td>{c.applicationCount}</td>
                  <td>
                    <span className={`badge ${c.isActive ? 'badge-green' : 'badge-grey'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="actions">
                    <div className="actions-stack">
                      <Link to={`/admin/categories/${c.id}`} className="btn btn-secondary btn-small">
                        Manage checklist
                      </Link>
                      {c.isActive ? (
                        <button type="button" className="btn btn-link" onClick={() => setToDeactivate(c)}>
                          Deactivate
                        </button>
                      ) : (
                        <button type="button" className="btn btn-link" onClick={() => setActive(c, true)}>
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form className="card form-card" onSubmit={handleCreate} noValidate>
        <h2>Add a category</h2>
        {formError && <div className="alert alert-error">{formError}</div>}
        <div className="form-row">
          <label className="field">
            <span>Code</span>
            <input name="code" value={form.code} onChange={update} placeholder="CAT-GEN" />
            {fieldError('code') || <small className="muted">CAT- followed by 2-10 letters or digits</small>}
          </label>
          <label className="field grow">
            <span>Name</span>
            <input name="name" value={form.name} onChange={update} placeholder="General" />
            {fieldError('name')}
          </label>
        </div>
        <label className="field">
          <span>
            Description <em className="muted">(optional)</em>
          </span>
          <input name="description" value={form.description} onChange={update} />
          {fieldError('description')}
        </label>
        <div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add category'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(toDeactivate)}
        title={`Deactivate ${toDeactivate?.name}?`}
        message="New applicants will no longer be able to choose this category. Applicants already in it keep their application and checklist."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => setActive(toDeactivate, false)}
        onCancel={() => setToDeactivate(null)}
      />
    </section>
  );
}
