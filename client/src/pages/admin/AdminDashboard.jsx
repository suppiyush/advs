import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Info,
  ListChecks,
  Minus,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchProgress } from '../../api/admin.js';
import { getApiError } from '../../api/client.js';
import { fetchPendingCases } from '../../api/verification.js';
import { ActivityChart, CategoryChart, Sparkline } from '../../components/charts.jsx';
import { timeAgo } from '../../components/notificationLabels.js';
import StatusBar from '../../components/StatusBar.jsx';
import { COLORS, formatNumber } from '../../theme.js';

const ACTIVITY_LABELS = {
  DOCUMENT_VERIFIED: 'verified',
  DOCUMENT_REJECTED: 'rejected',
  REMARK_ADDED: 'added a remark on',
  DECISION_CORRECTED: 'corrected the decision on',
};

const ALERT_ICONS = { critical: AlertOctagon, warning: AlertTriangle, info: Info };
const ALERT_CLASS = { critical: 'alert-error', warning: 'alert-warning', info: 'alert-info' };

const sum = (list) => list.reduce((a, b) => a + b, 0);

/** This week (last 7 days) vs the 7 days before, from the daily trend. */
function weekChange(trend, key) {
  const values = trend.map((d) => d[key]);
  const current = sum(values.slice(-7));
  const previous = sum(values.slice(-14, -7));
  return { current, previous, values };
}

function Change({ current, previous }) {
  if (previous === 0 && current === 0) return <span className="trend trend-flat">No activity in 2 weeks</span>;
  if (previous === 0) return <span className="trend trend-flat">New this week</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <span className="trend trend-flat" title={`${current} this week, ${previous} the week before`}>
      <Icon size={14} aria-hidden="true" />
      {pct > 0 ? '+' : ''}
      {pct}% vs last week
    </span>
  );
}

function KpiTile({ label, value, icon: Icon, children }) {
  return (
    <div className="card stat-tile">
      <div className="stat-tile-top">
        <span className="label">{label}</span>
        <span className="stat-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      </div>
      <span className="stat-value">{formatNumber(value)}</span>
      <div className="stat-footer">{children}</div>
    </div>
  );
}

function waitingDays(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
  return days < 1 ? 'today' : `${days} day${days === 1 ? '' : 's'}`;
}

// UC-014 View Progress Dashboard (FR-029): overall admission-verification progress.
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [oldest, setOldest] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProgress()
      .then(setData)
      .catch((err) => setError(getApiError(err).message));
    fetchPendingCases()
      .then((p) => setOldest(p.cases.slice(0, 5)))
      .catch(() => setOldest([]));
  }, []);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="page-loading">Loading dashboard…</div>;

  const { applications, documents, trend } = data;
  const completed = applications.byStatus.COMPLETED ?? 0;
  const completedPct = applications.total ? Math.round((completed / applications.total) * 100) : 0;
  const registrations = weekChange(trend, 'registrations');
  const uploads = weekChange(trend, 'uploads');
  const decisions = weekChange(trend, 'decisions');

  return (
    <section>
      <div className="page-heading">
        <h1>Admission progress</h1>
        <span className="muted small">Live data · last 14 days for trends</span>
      </div>

      <div className="stat-grid">
        <KpiTile label="Applications" value={applications.total} icon={Users}>
          <Change current={registrations.current} previous={registrations.previous} />
          <Sparkline values={registrations.values} />
        </KpiTile>
        <KpiTile label="Completed" value={completed} icon={CheckCircle2}>
          <span className="trend trend-flat">{completedPct}% of applications</span>
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${completedPct}%` }} />
          </div>
        </KpiTile>
        <KpiTile label="Awaiting verification" value={documents.PENDING ?? 0} icon={ClipboardCheck}>
          <span className="trend trend-flat">{uploads.current} uploaded this week</span>
          <Sparkline values={uploads.values} />
        </KpiTile>
        <KpiTile label="Decisions this week" value={decisions.current} icon={FileText}>
          <Change current={decisions.current} previous={decisions.previous} />
          <Sparkline values={decisions.values} color={COLORS.series[1]} />
        </KpiTile>
      </div>

      <div className="dashboard-grid">
        <div className="card chart-card span-2">
          <h2>Daily activity</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Documents uploaded by applicants and decisions recorded by verifiers, per day
          </p>
          <ActivityChart trend={trend} />
        </div>

        <div className="card">
          <h2>Needs attention</h2>
          {data.alerts.length === 0 ? (
            <p className="muted small">Nothing needs attention right now.</p>
          ) : (
            data.alerts.map((a, i) => {
              const Icon = ALERT_ICONS[a.severity];
              return (
                <div key={i} className={`alert ${ALERT_CLASS[a.severity]}`} role="status">
                  <Icon size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {a.message}{' '}
                    {a.type === 'NO_VERIFIER' && <Link to="/admin/users?role=VERIFIER">Assign a verifier</Link>}
                    {a.type === 'REGISTRATION_CLOSED' && <Link to="/admin/settings">Settings</Link>}
                  </span>
                </div>
              );
            })
          )}
          <h2 className="quick-title">Quick actions</h2>
          <div className="quick-actions">
            <Link to="/cases" className="quick-action">
              <ClipboardCheck size={16} aria-hidden="true" /> Pending cases
            </Link>
            <Link to="/admin/users" className="quick-action">
              <UserPlus size={16} aria-hidden="true" /> Add staff
            </Link>
            <Link to="/admin/categories" className="quick-action">
              <ListChecks size={16} aria-hidden="true" /> Checklists
            </Link>
            <Link to="/admin/reports" className="quick-action">
              <BarChart3 size={16} aria-hidden="true" /> Reports
            </Link>
            <Link to="/admin/settings" className="quick-action">
              <Settings size={16} aria-hidden="true" /> Settings
            </Link>
          </div>
        </div>

        <div className="card chart-card span-2">
          <h2>Applications by category</h2>
          <CategoryChart categories={data.categories} />
        </div>

        <div className="card">
          <h2>Status distribution</h2>
          <p className="label" style={{ margin: '0.75rem 0 0' }}>
            Applications
          </p>
          <StatusBar counts={applications.byStatus} label="Applications by status" />
          <p className="label" style={{ margin: '1.1rem 0 0' }}>
            Documents
          </p>
          <StatusBar counts={documents} label="Documents by status" />
        </div>

        <div className="card table-card span-2">
          <div className="card-header">
            <h2>Waiting longest for verification</h2>
            <Link to="/cases" className="small">
              All pending cases <ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: 'middle' }} />
            </Link>
          </div>
          {!oldest ? (
            <div className="page-loading">Loading…</div>
          ) : oldest.length === 0 ? (
            <div className="empty-state muted">No documents are waiting for verification.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Waiting</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {oldest.map((c) => (
                  <tr key={c.documentId}>
                    <td>
                      <strong>{c.application.applicantName}</strong>
                      <div className="muted small">{c.application.applicationNumber}</div>
                    </td>
                    <td>{c.documentType}</td>
                    <td>{c.category.name}</td>
                    <td className="nowrap">{waitingDays(c.uploadDate)}</td>
                    <td className="actions">
                      <Link to={`/cases/documents/${c.documentId}`} className="btn btn-secondary btn-small">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Recent verification activity</h2>
          {data.recentActivity.length === 0 ? (
            <p className="muted small">No decisions recorded yet.</p>
          ) : (
            <ol className="history">
              {data.recentActivity.slice(0, 6).map((a, i) => (
                <li key={i}>
                  <span className="small muted">{timeAgo(a.at)}</span>
                  <span>
                    <strong>{a.by ?? 'A removed user'}</strong> {ACTIVITY_LABELS[a.action] ?? a.action.toLowerCase()}{' '}
                    {a.details?.documentType ?? 'a document'}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
