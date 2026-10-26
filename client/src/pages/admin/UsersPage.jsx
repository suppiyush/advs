import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createUser, fetchUsers } from '../../api/admin.js';
import { fetchAllCategories } from '../../api/categories.js';
import { getApiError } from '../../api/client.js';
import { ROLE_LABEL } from '../../context/AuthContext.jsx';

const EMPTY = { name: '', email: '', phone: '', role: 'VERIFIER', assignedCategoryId: '', password: '' };

// UC-003 Manage Users (FR-005, FR-032).
export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ search: '', role: '' });
  const [query, setQuery] = useState(filters);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchAllCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery({ search: filters.search.trim(), role: filters.role }), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const params = {};
    if (query.search) params.search = query.search;
    if (query.role) params.role = query.role;
    fetchUsers(params)
      .then(setUsers)
      .catch((err) => setError(getApiError(err).message));
  }, [query, message]);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFields({ ...fields, [e.target.name]: undefined });
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const created = await createUser({
        ...form,
        phone: form.phone || null,
        assignedCategoryId: form.role === 'VERIFIER' && form.assignedCategoryId ? Number(form.assignedCategoryId) : null,
      });
      setMessage(`${ROLE_LABEL[created.role]} account created for ${created.name}. Share the initial password with them securely.`);
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) {
      const apiError = getApiError(err);
      setFormError(apiError.message);
      setFields(apiError.fields);
    } finally {
      setSaving(false);
    }
  }

  const fieldError = (name) => fields[name] && <small className="field-error">{fields[name]}</small>;

  return (
    <section>
      <div className="page-heading">
        <h1>Users &amp; Roles</h1>
        {!showForm && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => setShowForm(true)}>
            Add staff member
          </button>
        )}
      </div>
      <p className="muted">Applicants register themselves. Administrators create accounts for admission office staff.</p>

      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={handleCreate} noValidate>
          <h2>Add staff member</h2>
          {formError && <div className="alert alert-error">{formError}</div>}
          <div className="form-row">
            <label className="field grow">
              <span>Full name</span>
              <input name="name" value={form.name} onChange={update} />
              {fieldError('name')}
            </label>
            <label className="field grow">
              <span>Email</span>
              <input type="email" name="email" value={form.email} onChange={update} />
              {fieldError('email')}
            </label>
          </div>
          <div className="form-row">
            <label className="field grow">
              <span>Role</span>
              <select name="role" value={form.role} onChange={update}>
                <option value="VERIFIER">Admission Office Staff (Verifier)</option>
                <option value="ADMINISTRATOR">Administrator</option>
              </select>
            </label>
            {form.role === 'VERIFIER' && (
              <label className="field grow">
                <span>Category to verify</span>
                <select name="assignedCategoryId" value={form.assignedCategoryId} onChange={update}>
                  <option value="">Not assigned yet</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {fieldError('assignedCategoryId')}
              </label>
            )}
          </div>
          <div className="form-row">
            <label className="field grow">
              <span>
                Phone <em className="muted">(optional)</em>
              </span>
              <input type="tel" name="phone" value={form.phone} onChange={update} />
              {fieldError('phone')}
            </label>
            <label className="field grow">
              <span>Initial password</span>
              <input type="password" name="password" value={form.password} onChange={update} autoComplete="new-password" />
              {fieldError('password') || <small className="muted">At least 8 characters, with a letter and a digit.</small>}
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create account'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <select
          className="search-input filter-select"
          aria-label="Filter by role"
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
        >
          <option value="">All roles</option>
          <option value="APPLICANT">Applicants</option>
          <option value="VERIFIER">Admission Office Staff</option>
          <option value="ADMINISTRATOR">Administrators</option>
        </select>
        <input
          type="search"
          className="search-input"
          placeholder="Search name, email or application number"
          aria-label="Search users"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>

      <div className="card table-card">
        {!users ? (
          <div className="page-loading">Loading…</div>
        ) : users.length === 0 ? (
          <div className="empty-state muted">No users match.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Category</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? undefined : 'row-muted'}>
                  <td>
                    <strong>{u.name}</strong>
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>
                    {ROLE_LABEL[u.role]}
                    {u.application && <div className="muted small">{u.application.applicationNumber}</div>}
                  </td>
                  <td>{u.assignedCategoryName ?? u.application?.categoryName ?? '—'}</td>
                  <td>
                    <span className={`badge ${u.isActive ? 'badge-green' : 'badge-grey'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="actions">
                    <Link to={`/admin/users/${u.id}`} className="btn btn-secondary btn-small">
                      Manage
                    </Link>
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
