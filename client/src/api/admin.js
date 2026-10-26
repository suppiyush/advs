import { api } from './client.js';

export async function fetchUsers(params) {
  const { data } = await api.get('/admin/users', { params });
  return data.users;
}

export async function fetchUser(id) {
  const { data } = await api.get(`/admin/users/${id}`);
  return data.user;
}

export async function createUser(details) {
  const { data } = await api.post('/admin/users', details);
  return data.user;
}

export async function updateUser(id, changes) {
  const { data } = await api.patch(`/admin/users/${id}`, changes);
  return data.user;
}

export async function fetchSettings() {
  const { data } = await api.get('/admin/settings');
  return data.settings;
}

export async function saveSettings(changes) {
  const { data } = await api.put('/admin/settings', changes);
  return data.settings;
}

export async function fetchAuditLog(params) {
  const { data } = await api.get('/admin/audit-logs', { params });
  return data; // { entries, total, page, pageSize, actions }
}

export async function fetchProgress() {
  const { data } = await api.get('/reports/progress');
  return data;
}

export async function fetchCategorySummary() {
  const { data } = await api.get('/reports/category-summary');
  return data.categories;
}

export async function fetchVerificationActivity(params) {
  const { data } = await api.get('/reports/verification-activity', { params });
  return data;
}
