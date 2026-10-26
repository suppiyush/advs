import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUser, updateUser } from '../../api/admin.js';
import { fetchAllCategories } from '../../api/categories.js';
import { getApiError } from '../../api/client.js';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { ROLE_LABEL, useAuth } from '../../context/AuthContext.jsx';

// Edit one account: details, role (staff only), verifier category, applicant category,
// password reset and (de)activation (FR-005, FR-032).
export default function UserDetailPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  function show(u) {
    setUser(u);
    setForm({
      name: u.name,
      phone: u.phone ?? '',
      role: u.role,
      assignedCategoryId: u.assignedCategoryId ?? '',
      applicationCategoryId: u.application?.categoryId ?? '',
    });
  }

  useEffect(() => {
    fetchUser(id)
      .then(show)
      .catch((err) => setLoadError(getApiError(err).message));
    fetchAllCategories()
      .then(setCategories)
      .catch(() => {});
  }, [id]);

  async function save(changes, successMessage) {
    setSaving(true);
    setError(null);
    setMessage(null);
    setFields({});
    try {
      show(await updateUser(user.id, changes));
      setMessage(successMessage);
      return true;
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.message);
      setFields(apiError.fields ?? {});
      return false;
    } finally {
      setSaving(false);
    }
  }

  function saveDetails(e) {
    e.preventDefault();
    const changes = { name: form.name, phone: form.phone || null };
    if (user.role !== 'APPLICANT') {
      changes.role = form.role;
      if (form.role === 'VERIFIER') changes.assignedCategoryId = form.assignedCategoryId ? Number(form.assignedCategoryId) : null;
    } else if (form.applicationCategoryId && Number(form.applicationCategoryId) !== user.application?.categoryId) {
      changes.applicationCategoryId = Number(form.applicationCategoryId);
    }
    save(changes, 'Changes saved.');
  }

  async function resetPassword(e) {
    e.preventDefault();
    if (await save({ password: newPassword }, 'Password reset. Share the new password with the user securely.')) setNewPassword('');
  }

  if (loadError) {
    return (
      <section>
        <Link to="/admin/users" className="back-link">
          ← Users &amp; Roles
        </Link>
        <div className="alert alert-error">{loadError}</div>
      </section>
    );
  }
  if (!user) return <div className="page-loading">Loading…</div>;

  const isSelf = user.id === me.id;
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const fieldError = (name) => fields[name] && <small className="field-error">{fields[name]}</small>;

  return (
    <section>
      <Link to="/admin/users" className="back-link">
        ← Users &amp; Roles
      </Link>
      <h1>
        {user.name}{' '}
        <span className={`badge heading-badge ${user.isActive ? 'badge-green' : 'badge-grey'}`}>{user.isActive ? 'Active' : 'Inactive'}</span>
      </h1>
      <p className="muted">
        {user.email} · {ROLE_LABEL[user.role]} · joined {new Date(user.createdAt).toLocaleDateString()}
      </p>

      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="two-column">
        <form className="card form-card" onSubmit={saveDetails} noValidate>
          <h2>Details</h2>
          <label className="field">
            <span>Full name</span>
            <input name="name" value={form.name} onChange={update} />
            {fieldError('name')}
          </label>
          <label className="field">
            <span>
              Phone <em className="muted">(optional)</em>
            </span>
            <input name="phone" value={form.phone} onChange={update} />
            {fieldError('phone')}
          </label>

          {user.role === 'APPLICANT' ? (
            <label className="field">
              <span>Admission category</span>
              <select name="applicationCategoryId" value={form.applicationCategoryId} onChange={update}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {fieldError('applicationCategoryId') || (
                <small className="muted">
                  Can only change before the applicant uploads documents.{' '}
                  {user.application && <Link to={`/cases/applications/${user.application.id}`}>View application {user.application.applicationNumber}</Link>}
                </small>
              )}
            </label>
          ) : (
            <>
              <label className="field">
                <span>Role</span>
                <select name="role" value={form.role} onChange={update} disabled={isSelf}>
                  <option value="VERIFIER">Admission Office Staff (Verifier)</option>
                  <option value="ADMINISTRATOR">Administrator</option>
                </select>
                {isSelf ? <small className="muted">You cannot change your own role.</small> : fieldError('role')}
              </label>
              {form.role === 'VERIFIER' && (
                <label className="field">
                  <span>Category to verify</span>
                  <select name="assignedCategoryId" value={form.assignedCategoryId} onChange={update}>
                    <option value="">Not assigned</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  {fieldError('assignedCategoryId')}
                </label>
              )}
            </>
          )}
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              Save changes
            </button>
          </div>
        </form>

        <div>
          <form className="card form-card" onSubmit={resetPassword} noValidate>
            <h2>Reset password</h2>
            <label className="field">
              <span>New password</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
              {fieldError('password') || <small className="muted">At least 8 characters, with a letter and a digit.</small>}
            </label>
            <div>
              <button type="submit" className="btn btn-secondary" disabled={saving || !newPassword}>
                Reset password
              </button>
            </div>
          </form>

          <div className="card form-card">
            <h2>Account access</h2>
            {isSelf ? (
              <p className="muted small">You cannot deactivate your own account.</p>
            ) : user.isActive ? (
              <>
                <p className="muted small">A deactivated user is logged out at once and cannot log in. Their records stay.</p>
                <div>
                  <button type="button" className="btn btn-danger" onClick={() => setConfirmDeactivate(true)} disabled={saving}>
                    Deactivate account
                  </button>
                </div>
              </>
            ) : (
              <div>
                <button type="button" className="btn btn-primary" onClick={() => save({ isActive: true }, 'Account reactivated.')} disabled={saving}>
                  Reactivate account
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeactivate}
        title={`Deactivate ${user.name}?`}
        message="They will be logged out immediately and will not be able to log in until reactivated."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => {
          setConfirmDeactivate(false);
          save({ isActive: false }, 'Account deactivated.');
        }}
        onCancel={() => setConfirmDeactivate(false)}
      />
    </section>
  );
}
