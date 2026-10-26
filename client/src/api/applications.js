import { api } from './client.js';

export async function fetchMyApplication() {
  const { data } = await api.get('/applications/me');
  return data.application;
}

/** UC-005: returns { result, application } with the refreshed checklist and missing list. */
export async function uploadDocument(checklistItemId, file, { confirmReplace = false, onProgress } = {}) {
  const form = new FormData();
  form.append('checklistItemId', String(checklistItemId));
  form.append('confirmReplace', String(confirmReplace));
  form.append('file', file);
  const { data } = await api.post('/applications/me/documents', form, {
    onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
  });
  return data;
}

export async function fetchDocument(id) {
  const { data } = await api.get(`/documents/${id}`);
  return data.document;
}

/** Same-origin URL; the session cookie authorises it, so it works in links and <iframe>/<img>. */
export function documentFileUrl(id, version) {
  return `/api/documents/${id}/file${version ? `?version=${version}` : ''}`;
}
