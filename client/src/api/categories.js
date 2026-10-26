import { api } from './client.js';

export async function fetchAllCategories() {
  const { data } = await api.get('/admin/categories');
  return data.categories;
}

export async function fetchCategory(id) {
  const { data } = await api.get(`/admin/categories/${id}`);
  return data.category;
}

export async function createCategory(details) {
  const { data } = await api.post('/admin/categories', details);
  return data.category;
}

export async function updateCategory(id, changes) {
  const { data } = await api.patch(`/admin/categories/${id}`, changes);
  return data.category;
}

export async function addChecklistItem(categoryId, item) {
  const { data } = await api.post(`/admin/categories/${categoryId}/checklist`, item);
  return data.item;
}

export async function updateChecklistItem(id, changes) {
  const { data } = await api.patch(`/admin/checklist-items/${id}`, changes);
  return data.item;
}

export async function removeChecklistItem(id) {
  await api.delete(`/admin/checklist-items/${id}`);
}
