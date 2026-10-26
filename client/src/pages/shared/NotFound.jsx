import { Link } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';

export default function NotFound() {
  return (
    <div className="center-page">
      <div className="card auth-card">
        <Logo size={48} />
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn-primary">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
