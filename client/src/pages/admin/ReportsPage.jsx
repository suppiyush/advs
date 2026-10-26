import { useEffect, useState } from 'react';
import { fetchCategorySummary, fetchVerificationActivity } from '../../api/admin.js';
import { getApiError } from '../../api/client.js';

const isoDay = (d) => d.toISOString().slice(0, 10);

// UC-015 Generate Reports: verification activity (FR-030) and category-wise summary (FR-031).
export default function ReportsPage() {
  const [tab, setTab] = useState('activity');
  const [range, setRange] = useState({ from: isoDay(new Date(Date.now() - 30 * 86_400_000)), to: isoDay(new Date()) });
  const [activity, setActivity] = useState(null);
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    if (tab === 'activity') {
      if (!range.from || !range.to) return;
      setActivity(null);
      fetchVerificationActivity(range)
        .then(setActivity)
        .catch((err) => setError(getApiError(err).message));
    } else {
      fetchCategorySummary()
        .then(setCategories)
        .catch((err) => setError(getApiError(err).message));
    }
  }, [tab, range]);

  const totals = activity?.verifiers.reduce(
    (t, v) => ({
      verified: t.verified + v.verified,
      rejected: t.rejected + v.rejected,
      remarks: t.remarks + v.remarks,
      corrections: t.corrections + v.corrections,
    }),
    { verified: 0, rejected: 0, remarks: 0, corrections: 0 },
  );

  return (
    <section>
      <h1>Reports</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'activity'} className={`tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>
            Verification activity
          </button>
          <button type="button" role="tab" aria-selected={tab === 'categories'} className={`tab${tab === 'categories' ? ' active' : ''}`} onClick={() => setTab('categories')}>
            Category summary
          </button>
        </div>
        {tab === 'activity' && (
          <div className="date-range">
            <label>
              From <input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </label>
            <label>
              To <input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      {tab === 'activity' ? (
        <div className="card table-card">
          {!activity ? (
            <div className="page-loading">Loading…</div>
          ) : activity.verifiers.length === 0 ? (
            <div className="empty-state muted">No decisions were recorded in this period.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th className="num">Verified</th>
                  <th className="num">Rejected</th>
                  <th className="num">Remarks (kept pending)</th>
                  <th className="num">Corrections</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {activity.verifiers.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td className="num">{v.verified}</td>
                    <td className="num">{v.rejected}</td>
                    <td className="num">{v.remarks}</td>
                    <td className="num">{v.corrections}</td>
                    <td className="num">
                      <strong>{v.verified + v.rejected + v.remarks + v.corrections}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>All staff</th>
                  <th className="num">{totals.verified}</th>
                  <th className="num">{totals.rejected}</th>
                  <th className="num">{totals.remarks}</th>
                  <th className="num">{totals.corrections}</th>
                  <th className="num">{totals.verified + totals.rejected + totals.remarks + totals.corrections}</th>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      ) : (
        <div className="card table-card">
          {!categories ? (
            <div className="page-loading">Loading…</div>
          ) : (
            <table className="table table-compact">
              <thead>
                <tr className="group-header">
                  <th rowSpan={2}>Category</th>
                  <th colSpan={5} className="group-start">
                    Applications
                  </th>
                  <th colSpan={3} className="group-start">
                    Documents
                  </th>
                </tr>
                <tr>
                  <th className="num group-start">Total</th>
                  <th className="num">Completed</th>
                  <th className="num">In review</th>
                  <th className="num">Pending</th>
                  <th className="num">Rejected</th>
                  <th className="num group-start">Pending</th>
                  <th className="num">Verified</th>
                  <th className="num">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className={c.isActive ? undefined : 'row-muted'}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="muted small">{c.code}</div>
                    </td>
                    <td className="num group-start">
                      <strong>{c.applications.total}</strong>
                    </td>
                    <td className="num">{c.applications.completed}</td>
                    <td className="num">{c.applications.underReview}</td>
                    <td className="num">{c.applications.pending}</td>
                    <td className="num">{c.applications.rejected}</td>
                    <td className="num group-start">{c.documents.pending}</td>
                    <td className="num">{c.documents.verified}</td>
                    <td className="num">{c.documents.rejected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
