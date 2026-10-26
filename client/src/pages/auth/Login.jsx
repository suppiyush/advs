import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { getApiError } from '../../api/client.js';
import { ROLE_HOME, useAuth } from '../../context/AuthContext.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const loggedIn = await login(form.email, form.password);
      // Activity diagrams: valid credentials -> the role's own dashboard.
      const from = location.state?.from?.pathname;
      navigate(from && from.startsWith(ROLE_HOME[loggedIn.role]) ? from : ROLE_HOME[loggedIn.role], { replace: true });
    } catch (err) {
      // Activity diagrams: invalid credentials -> show error, stay on the login form.
      setError(getApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit} noValidate>
        <h1>Log in to ADVS</h1>
        <p className="muted">Admission Document Verification System</p>

        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}

        <label className="field">
          <span>Email</span>
          <input type="email" name="email" value={form.email} onChange={update} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={update}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-switch">
          New applicant? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </div>
  );
}
