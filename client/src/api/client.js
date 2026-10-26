import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/** Turns an API error into { message, fields } for display (NFR-009). */
export function getApiError(err) {
  const error = err?.response?.data?.error;
  if (error) return { message: error.message, fields: error.fields || {} };
  if (err?.request) return { message: 'Cannot reach the server. Check your connection and try again.', fields: {} };
  return { message: 'Something went wrong. Please try again.', fields: {} };
}
