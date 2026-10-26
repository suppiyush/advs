import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notifications.js';
import { NOTIFICATION_LABELS, NOTIFICATIONS_CHANGED, timeAgo } from './notificationLabels.js';

const POLL_MS = 30_000;

/** Unread count in the top bar, polled every 30 s, with a dropdown of the latest notifications. */
export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const wrapperRef = useRef(null);

  const refreshCount = useCallback(() => {
    fetchUnreadCount()
      .then(setUnread)
      .catch(() => {});
  }, []);

  // Poll, and refresh whenever the page changes (an action may have produced a notification).
  useEffect(() => {
    refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, refreshCount);
    };
  }, [refreshCount, location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    fetchNotifications(6)
      .then((data) => {
        setItems(data.notifications);
        setUnread(data.unread);
      })
      .catch(() => setItems([]));

    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  async function openNotification(n) {
    setOpen(false);
    if (!n.isRead) {
      await markNotificationRead(n.id).catch(() => {});
      refreshCount();
    }
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => {});
    setItems((list) => list?.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
  }

  return (
    <div className="bell" ref={wrapperRef}>
      <button
        type="button"
        className="icon-button"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-header">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="btn btn-link btn-small" onClick={readAll}>
                Mark all as read
              </button>
            )}
          </div>
          {!items ? (
            <div className="bell-empty muted">Loading…</div>
          ) : items.length === 0 ? (
            <div className="bell-empty muted">No notifications yet.</div>
          ) : (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`bell-item${n.isRead ? '' : ' unread'}`} onClick={() => openNotification(n)}>
                    <span className="bell-item-meta">
                      <span>{NOTIFICATION_LABELS[n.type]}</span>
                      <span>{timeAgo(n.createdAt)}</span>
                    </span>
                    <span className="bell-item-message">{n.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" className="bell-footer" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
