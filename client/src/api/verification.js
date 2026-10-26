import { api } from './client.js';

export async function fetchPendingCases(params) {
  const { data } = await api.get('/verification/pending', { params });
  return data; // { noCategoryAssigned, cases }
}

export async function fetchStaffApplications(params) {
  const { data } = await api.get('/verification/applications', { params });
  return data.applications;
}

export async function fetchStaffApplication(id) {
  const { data } = await api.get(`/verification/applications/${id}`);
  return data.application;
}

export async function recordDecision(documentId, { status, remarks, version }) {
  const { data } = await api.post(`/documents/${documentId}/decision`, { status, remarks, version });
  return data.decision;
}

export async function correctDecision(documentId, { status, reason }) {
  const { data } = await api.post(`/documents/${documentId}/correction`, { status, reason });
  return data.decision;
}
