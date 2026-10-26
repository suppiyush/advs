import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { fetchCategories } from '../../api/auth.js';
import { getApiError } from '../../api/client.js';
import { ROLE_HOME, useAuth } from '../../context/AuthContext.jsx';

const EMPTY = { name: '', email: '', phone: '', password: '', confirmPassword: '', categoryId: '' };

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch((err) => setError(getApiError(err).message));
  }, []);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFields({ ...fields, [e.target.name]: undefined });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setFields({ confirmPassword: 'Passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      const { confirmPassword, ...details } = form;
      await register(details);
      navigate(ROLE_HOME.APPLICANT, { replace: true });
    } catch (err) {
      const apiError = getApiError(err);
      setError(apiError.message);
      setFields(apiError.fields);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldError = (name) => fields[name] && <small className="field-error">{fields[name]}</small>;

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Applicant registration</h1>
        <p className="muted">Create an account to upload your admission documents.</p>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span>Full name</span>
          <input name="name" value={form.name} onChange={update} autoComplete="name" />
          {fieldError('name')}
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" value={form.email} onChange={update} autoComplete="email" />
          {fieldError('email')}
        </label>
        <label className="field">
          <span>
            Phone <em className="muted">(optional)</em>
          </span>
          <input type="tel" name="phone" value={form.phone} onChange={update} autoComplete="tel" />
          {fieldError('phone')}
        </label>
        <label className="field">
          <span>Admission category</span>
          <select name="categoryId" value={form.categoryId} onChange={update}>
            <option value="">Select your category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {fieldError('categoryId')}
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" value={form.password} onChange={update} autoComplete="new-password" />
          {fieldError('password') || <small className="muted">At least 8 characters, with a letter and a digit.</small>}
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={update}
            autoComplete="new-password"
          />
          {fieldError('confirmPassword')}
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
        <p className="auth-switch">
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}
