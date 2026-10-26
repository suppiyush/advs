import { api } from './client.js';

export async function fetchNotifications(limit) {
  const { data } = await api.get('/notifications', { params: limit ? { limit } : undefined });
  return data; // { notifications, unread }
}

export async function fetchUnreadCount() {
  const { data } = await api.get('/notifications/unread-count');
  return data.unread;
}

export async function markNotificationRead(id) {
  const { data } = await api.patch(`/notifications/${id}/read`);
  return data.notification;
}

export async function markAllNotificationsRead() {
  await api.patch('/notifications/read-all');
}

export async function sendMissingReminder(applicationId) {
  const { data } = await api.post(`/verification/applications/${applicationId}/remind`);
  return data.reminder;
}
