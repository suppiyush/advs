import { api } from './client.js';

export async function fetchMyApplication() {
  const { data } = await api.get('/applications/me');
  return data.application;
}
