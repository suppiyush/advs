// A single stacked bar showing how items split across statuses. Status colours are the reserved
// ones used by StatusBadge; every segment also has a text label and count in the legend, so
// identity never depends on colour alone. Hovering a segment shows its count and share.
const STATUS_ORDER = ['COMPLETED', 'VERIFIED', 'UNDER_REVIEW', 'PENDING', 'REJECTED', 'MISSING'];
const LABELS = {
  COMPLETED: 'Completed',
  VERIFIED: 'Verified',
  UNDER_REVIEW: 'Under review',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
  MISSING: 'Missing',
};
const TONE = {
  COMPLETED: 'green',
  VERIFIED: 'green',
  UNDER_REVIEW: 'blue',
  PENDING: 'amber',
  REJECTED: 'red',
  MISSING: 'grey',
};

export default function StatusBar({ counts, label }) {
  const parts = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => ({ status: s, count: counts[s] }));
  const total = parts.reduce((sum, p) => sum + p.count, 0);

  return (
    <figure className="status-bar">
      {total === 0 ? (
        <div className="status-bar-track empty" role="img" aria-label={`${label}: none yet`} />
      ) : (
        <div className="status-bar-track" role="img" aria-label={`${label}: ${parts.map((p) => `${LABELS[p.status]} ${p.count}`).join(', ')}`}>
          {parts.map((p) => (
            <span
              key={p.status}
              className={`status-bar-segment tone-${TONE[p.status]}`}
              style={{ flexGrow: p.count }}
              title={`${LABELS[p.status]}: ${p.count} (${Math.round((p.count / total) * 100)}%)`}
            />
          ))}
        </div>
      )}
      <figcaption className="status-legend">
        {(parts.length ? parts : []).map((p) => (
          <span key={p.status} className="status-legend-item">
            <span className={`status-legend-swatch tone-${TONE[p.status]}`} aria-hidden="true" />
            {LABELS[p.status]} <strong>{p.count}</strong>
          </span>
        ))}
        {total === 0 && <span className="muted small">Nothing yet</span>}
      </figcaption>
    </figure>
  );
}
