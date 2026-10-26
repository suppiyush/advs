// Colours follow the Document state diagram: Pending amber, Verified green, Rejected red.
const LABELS = {
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  COMPLETED: 'Completed',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  MISSING: 'Missing',
};

const TONES = {
  PENDING: 'amber',
  UNDER_REVIEW: 'blue',
  COMPLETED: 'green',
  VERIFIED: 'green',
  REJECTED: 'red',
  MISSING: 'grey',
};

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${TONES[status] || 'grey'}`}>{LABELS[status] || status}</span>;
}
