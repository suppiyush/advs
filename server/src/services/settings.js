// System configuration values (FR-034), stored as JSON in system_settings.
import { query } from '../config/db.js';

export const DEFAULT_SETTINGS = Object.freeze({
  registration_open: true,
  max_upload_mb: 5,
  allowed_mime_types: ['application/pdf', 'image/jpeg', 'image/png'],
});

export async function getSetting(key) {
  const { rows } = await query('SELECT value FROM system_settings WHERE key = $1', [key]);
  return rows.length ? rows[0].value : DEFAULT_SETTINGS[key];
}
