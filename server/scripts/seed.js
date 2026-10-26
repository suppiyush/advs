// Sample data for development and demos (§9: "sample data will be used"). Safe to re-run.
import { pool, withTransaction } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { APPLICATION_STATUS, ROLES } from '../src/config/constants.js';
import { formatApplicationNumber, hashPassword } from '../src/modules/auth/auth.service.js';
import { DEFAULT_SETTINGS } from '../src/services/settings.js';

const COMMON_ITEMS = [
  'Class X Marksheet',
  'Class XII Marksheet',
  'Entrance Scorecard',
  'Identity Proof',
  'Passport Photo',
];

const CATEGORIES = [
  { code: 'CAT-GEN', name: 'General', description: 'General category', extra: [] },
  {
    code: 'CAT-OBC',
    name: 'OBC-NCL',
    description: 'Other Backward Classes (Non-Creamy Layer)',
    extra: ['Category Certificate', 'Income Certificate'],
  },
  { code: 'CAT-SCST', name: 'SC/ST', description: 'Scheduled Castes / Scheduled Tribes', extra: ['Category Certificate'] },
  { code: 'CAT-EWS', name: 'EWS', description: 'Economically Weaker Section', extra: ['Income Certificate'] },
];

const USERS = [
  { name: 'ADVS Administrator', email: 'admin@advs.local', role: ROLES.ADMINISTRATOR },
  { name: 'Anita Singh', email: 'verifier.gen@advs.local', role: ROLES.VERIFIER, category: 'CAT-GEN' },
  { name: 'Vikram Rao', email: 'verifier.obc@advs.local', role: ROLES.VERIFIER, category: 'CAT-OBC' },
  { name: 'Rahul Mehta', email: 'rahul.mehta@advs.local', role: ROLES.APPLICANT, category: 'CAT-GEN' },
  { name: 'Priya Sharma', email: 'priya.sharma@advs.local', role: ROLES.APPLICANT, category: 'CAT-OBC' },
  { name: 'Arjun Verma', email: 'arjun.verma@advs.local', role: ROLES.APPLICANT, category: 'CAT-EWS' },
];

async function seed() {
  if (env.isProduction) throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('Set SEED_PASSWORD in server/.env before seeding.');
  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    const categoryIds = {};
    for (const c of CATEGORIES) {
      const { rows } = await client.query(
        `INSERT INTO categories (code, name, description) VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
         RETURNING id`,
        [c.code, c.name, c.description],
      );
      categoryIds[c.code] = rows[0].id;
      for (const documentType of [...COMMON_ITEMS, ...c.extra]) {
        await client.query(
          `INSERT INTO checklist_items (category_id, document_type, is_mandatory) VALUES ($1, $2, true)
           ON CONFLICT (category_id, document_type) DO NOTHING`,
          [rows[0].id, documentType],
        );
      }
    }

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(
        `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(value)],
      );
    }

    for (const u of USERS) {
      const assignedCategory = u.role === ROLES.VERIFIER ? categoryIds[u.category] : null;
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, assigned_category_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
               assigned_category_id = EXCLUDED.assigned_category_id, is_active = true, updated_at = now()
         RETURNING id`,
        [u.name, u.email, passwordHash, u.role, assignedCategory],
      );

      if (u.role === ROLES.APPLICANT) {
        const existing = await client.query('SELECT 1 FROM applications WHERE applicant_id = $1', [rows[0].id]);
        if (!existing.rows.length) {
          const { rows: seq } = await client.query(`SELECT nextval('application_number_seq') AS seq`);
          await client.query(
            `INSERT INTO applications (application_number, applicant_id, category_id, overall_status)
             VALUES ($1, $2, $3, $4)`,
            [formatApplicationNumber(seq[0].seq), rows[0].id, categoryIds[u.category], APPLICATION_STATUS.PENDING],
          );
        }
      }
    }
  });

  console.log('Seed complete. Demo users (password = SEED_PASSWORD from server/.env):');
  for (const u of USERS) console.log(`  ${u.role.padEnd(13)} ${u.email}`);
}

seed()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
