import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronsLeft, ChevronsRight, LogOut, Menu, Search, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_HOME, ROLE_LABEL, useAuth } from '../context/AuthContext.jsx';
import { NAV_GROUPS } from '../navigation.js';
import Breadcrumbs from './Breadcrumbs.jsx';
import Logo from './Logo.jsx';
import NotificationBell from './NotificationBell.jsx';

const COLLAPSE_KEY = 'advs.sidebarCollapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** Staff search: jumps to the applicants list filtered by name or application number. */
function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    const q = value.trim();
    navigate(q ? `/cases?tab=applicants&search=${encodeURIComponent(q)}` : '/cases?tab=applicants');
  }

  return (
    <form className="global-search" role="search" onSubmit={submit}>
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search applicant or application no."
        aria-label="Search applicants by name or application number"
      />
    </form>
  );
}

function ProfileMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="profile" ref={ref}>
      <button
        type="button"
        className="profile-button"
        aria-label={`Account menu for ${user.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="user-meta">
          <span className="user-name">{user.name}</span>
          <span className="user-role">{ROLE_LABEL[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <Link to="/notifications" className="menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Bell size={16} aria-hidden="true" /> Notifications
          </Link>
          <button type="button" className="menu-item danger" role="menuitem" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  );
}

// One layout for every role (NFR-008): navy sidebar with grouped navigation, top bar with
// breadcrumbs, search (staff), notifications and profile. On narrow screens the sidebar is a drawer.
export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the page changes.
  useEffect(() => setDrawerOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      // Preference just isn't remembered.
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  const isStaff = user.role !== 'APPLICANT';

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <aside className="sidebar" id="sidebar" aria-label="Main navigation">
        <Link to={ROLE_HOME[user.role]} className="sidebar-brand" title="ADVS home" aria-label="ADVS home">
          <Logo size={36} decorative />
          <span className="brand-text">
            <span className="brand-name">ADVS</span>
            <span className="brand-sub">Admission Document Verification</span>
          </span>
        </Link>

        <nav className="sidebar-nav">
          {NAV_GROUPS[user.role].map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className="nav-link" aria-label={label} title={collapsed ? label : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronsRight size={18} aria-hidden="true" /> : <ChevronsLeft size={18} aria-hidden="true" />}
            <span className="sidebar-toggle-label">Collapse</span>
          </button>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      <div className="main-column">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar-menu"
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-controls="sidebar"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            {drawerOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <Breadcrumbs role={user.role} />
          <div className="topbar-actions">
            {isStaff && <GlobalSearch />}
            <NotificationBell />
            <ProfileMenu user={user} onLogout={handleLogout} />
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
