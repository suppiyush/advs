// Runs once before the whole test run. Each test file deletes its own throwaway data afterwards,
// but a run cut short (e.g. by a dropped connection) leaves some behind; remove all of it here.
// Throwaway data is recognisable: users with @advs.test emails and categories coded CAT-T….
import 'dotenv/config';

export default async function setup() {
  if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { pool } = await import('../src/config/db.js');
  const { uploadRoot } = await import('../src/services/fileStore.js');

  try {
    const { rows } = await pool.query(
      `SELECT a.id FROM applications a JOIN users u ON u.id = a.applicant_id WHERE u.email LIKE '%@advs.test'`,
    );
    for (const { id } of rows) await fs.rm(path.join(uploadRoot, String(id)), { recursive: true, force: true });
    // Applicants first: their documents and verification records reference the staff.
    await pool.query(`DELETE FROM users WHERE email LIKE '%@advs.test' AND role = 'APPLICANT'`);
    await pool.query(`DELETE FROM users WHERE email LIKE '%@advs.test'`);
    await pool.query(`DELETE FROM categories WHERE code LIKE 'CAT-T%'`);
  } finally {
    await pool.end();
  }
}
