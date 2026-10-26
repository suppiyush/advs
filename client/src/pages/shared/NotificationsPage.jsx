import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiError } from '../../api/client.js';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications.js';
import { announceNotificationsChanged, NOTIFICATION_LABELS, timeAgo } from '../../components/notificationLabels.js';

// US-010: receive notifications about verification status without repeatedly checking.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchNotifications(100)
      .then(setData)
      .catch((err) => setError(getApiError(err).message));
  }, []);

  async function open(n) {
    if (!n.isRead) {
      await markNotificationRead(n.id).catch(() => {});
      announceNotificationsChanged();
    }
    if (n.link) navigate(n.link);
    else
      setData((d) => ({
        unread: Math.max(0, d.unread - (n.isRead ? 0 : 1)),
        notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)),
      }));
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => {});
    announceNotificationsChanged();
    setData((d) => ({ unread: 0, notifications: d.notifications.map((n) => ({ ...n, isRead: true })) }));
  }

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data) return <div className="page-loading">Loading…</div>;

  return (
    <section>
      <div className="page-heading">
        <h1>Notifications</h1>
        {data.unread > 0 && (
          <button type="button" className="btn btn-secondary btn-small" onClick={readAll}>
            Mark all as read ({data.unread})
          </button>
        )}
      </div>

      <div className="card table-card">
        {data.notifications.length === 0 ? (
          <div className="empty-state muted">You have no notifications yet.</div>
        ) : (
          <ul className="notification-list">
            {data.notifications.map((n) => (
              <li key={n.id}>
                <button type="button" className={`notification-row${n.isRead ? '' : ' unread'}`} onClick={() => open(n)}>
                  <span className={`notification-type type-${n.type.toLowerCase()}`}>{NOTIFICATION_LABELS[n.type]}</span>
                  <span className="notification-message">{n.message}</span>
                  <span className="notification-time muted small" title={new Date(n.createdAt).toLocaleString()}>
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
