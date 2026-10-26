import { Link } from 'react-router-dom';

export default function Forbidden() {
  return (
    <div className="center-page">
      <div className="card auth-card">
        <h1>Access denied</h1>
        <p className="muted">Your role does not have access to this page.</p>
        <Link to="/" className="btn btn-primary">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
