// Short labels for the NotificationType enumeration (class diagram), shared by the bell and the page.
export const NOTIFICATION_LABELS = {
  STATUS_UPDATE: 'Status update',
  MISSING_DOCUMENT: 'Missing documents',
  REMARK_ADDED: 'Remark added',
  NEW_SUBMISSION: 'New submission',
};

/** Lets the top-bar bell refresh its count when another component marks notifications read. */
export const NOTIFICATIONS_CHANGED = 'advs:notifications-changed';

export function announceNotificationsChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function timeAgo(date) {
  const seconds = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(date).toLocaleDateString();
}
