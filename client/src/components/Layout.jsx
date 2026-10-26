import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABEL, useAuth } from '../context/AuthContext.jsx';

// One consistent layout for every role (NFR-008); only the side navigation differs.
// Items marked "soon" are built in later increments.
const NAV = {
  APPLICANT: [
    { to: '/applicant', label: 'My Application', end: true },
    { label: 'Notifications', soon: true },
  ],
  VERIFIER: [
    { to: '/cases', label: 'Pending Cases' },
    { label: 'Notifications', soon: true },
  ],
  ADMINISTRATOR: [
    { to: '/admin', label: 'Users & Roles', end: true },
    { to: '/admin/categories', label: 'Categories & Checklists' },
    { to: '/cases', label: 'Verification' },
    { label: 'Reports & Dashboards', soon: true },
    { label: 'System Configuration', soon: true },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ADVS</span>
          <span className="brand-name">Admission Document Verification System</span>
        </div>
        <div className="topbar-user">
          <div className="user-meta">
            <span className="user-name">{user.name}</span>
            <span className="user-role">{ROLE_LABEL[user.role]}</span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className="sidenav" aria-label="Main navigation">
          {NAV[user.role].map((item) =>
            item.soon ? (
              <span key={item.label} className="nav-link disabled" title="Coming in a later increment">
                {item.label}
              </span>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
