// Administrator.manageUsers() (UC-003; FR-005, FR-032). Every change is audit-logged (FR-035).
import { query, withTransaction } from '../../config/db.js';
import { ROLES } from '../../config/constants.js';
import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../../services/audit.js';
import { hashPassword, toPublicUser } from '../auth/auth.service.js';
import { recomputeApplicationStatus } from '../documents/document.service.js';

const STAFF_ROLES = [ROLES.VERIFIER, ROLES.ADMINISTRATOR];

const USER_SELECT = `
  SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.assigned_category_id, u.created_at,
         c.name AS assigned_category_name,
         a.id AS application_id, a.application_number, a.category_id AS application_category_id,
         ac.name AS application_category_name
    FROM users u
    LEFT JOIN categories c ON c.id = u.assigned_category_id
    LEFT JOIN LATERAL (SELECT * FROM applications WHERE applicant_id = u.id ORDER BY submission_date DESC LIMIT 1) a ON TRUE
    LEFT JOIN categories ac ON ac.id = a.category_id`;

function toAdminUser(row) {
  return {
    ...toPublicUser(row),
    assignedCategoryName: row.assigned_category_name,
    application: row.application_id
      ? {
          id: row.application_id,
          applicationNumber: row.application_number,
          categoryId: row.application_category_id,
          categoryName: row.application_category_name,
        }
      : null,
  };
}

export async function listUsers({ search, role } = {}) {
  const params = [];
  const where = [];
  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR a.application_number ILIKE $${params.length})`);
  }
  const { rows } = await query(
    `${USER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY u.is_active DESC, CASE u.role WHEN 'ADMINISTRATOR' THEN 0 WHEN 'VERIFIER' THEN 1 ELSE 2 END, u.name`,
    params,
  );
  return rows.map(toAdminUser);
}

export async function getUser(id, db = { query }) {
  const { rows } = await db.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'User not found.');
  return toAdminUser(rows[0]);
}

async function assertActiveCategory(categoryId, db) {
  const { rows } = await db.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (!rows[0]) throw new AppError(400, 'INVALID_CATEGORY', 'Choose a valid category.', { assignedCategoryId: 'Choose a valid category.' });
}

/** Creates a staff account (verifier or administrator) with an initial password. */
export async function createStaffUser(data, actorId) {
  return withTransaction(async (client) => {
    if (data.assignedCategoryId) await assertActiveCategory(data.assignedCategoryId, client);
    let id;
    try {
      ({ rows: [{ id }] } = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role, assigned_category_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [data.name, data.email, data.phone ?? null, await hashPassword(data.password), data.role, data.role === ROLES.VERIFIER ? (data.assignedCategoryId ?? null) : null],
      ));
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', { email: 'An account with this email already exists.' });
      }
      throw err;
    }
    await recordAudit(
      { actorId, action: 'USER_CREATED', entityType: 'user', entityId: id, details: { email: data.email, role: data.role, assignedCategoryId: data.assignedCategoryId ?? null } },
      client,
    );
    return getUser(id, client);
  });
}

/**
 * Updates a user. Rules:
 *  - Roles change only between Verifier and Administrator. Applicant accounts own an application,
 *    so they stay applicants, and staff cannot become applicants (FR-005 scoped to staff).
 *  - Only verifiers have an assigned category; becoming an administrator clears it.
 *  - Administrators cannot deactivate or demote themselves, so the system always keeps one.
 *  - An applicant's category can change only while they have uploaded nothing (BR-006): their
 *    documents belong to the old category's checklist.
 */
export async function updateUser(id, changes, actor) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
    const user = rows[0];
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found.');

    const self = user.id === actor.id;
    if (self && (changes.isActive === false || (changes.role && changes.role !== user.role))) {
      throw new AppError(400, 'SELF_LOCKOUT', 'You cannot deactivate your own account or change your own role.');
    }

    let role = user.role;
    if (changes.role && changes.role !== user.role) {
      if (!STAFF_ROLES.includes(user.role) || !STAFF_ROLES.includes(changes.role)) {
        throw new AppError(400, 'ROLE_CHANGE_NOT_ALLOWED', 'Roles can only change between Verifier and Administrator.', {
          role: 'Applicant accounts cannot become staff, and staff cannot become applicants.',
        });
      }
      role = changes.role;
    }

    let assignedCategoryId = user.assigned_category_id;
    if ('assignedCategoryId' in changes) {
      if (role !== ROLES.VERIFIER && changes.assignedCategoryId) {
        throw new AppError(400, 'NOT_A_VERIFIER', 'Only verifiers are assigned a category.', { assignedCategoryId: 'Only verifiers are assigned a category.' });
      }
      if (changes.assignedCategoryId) await assertActiveCategory(changes.assignedCategoryId, client);
      assignedCategoryId = changes.assignedCategoryId ?? null;
    }
    if (role !== ROLES.VERIFIER) assignedCategoryId = null;

    const passwordHash = changes.password ? await hashPassword(changes.password) : null;
    await client.query(
      `UPDATE users
          SET name = COALESCE($2, name),
              phone = CASE WHEN $3::boolean THEN $4 ELSE phone END,
              role = $5,
              is_active = COALESCE($6, is_active),
              assigned_category_id = $7,
              password_hash = COALESCE($8, password_hash),
              updated_at = now()
        WHERE id = $1`,
      [id, changes.name ?? null, 'phone' in changes, changes.phone ?? null, role, changes.isActive ?? null, assignedCategoryId, passwordHash],
    );

    if (changes.applicationCategoryId) {
      if (user.role !== ROLES.APPLICANT) {
        throw new AppError(400, 'NOT_AN_APPLICANT', 'Only applicants have an application category.');
      }
      await assertActiveCategory(changes.applicationCategoryId, client);
      const { rows: apps } = await client.query(
        `SELECT a.id, a.category_id, (SELECT count(*) FROM documents d WHERE d.application_id = a.id) AS documents
           FROM applications a WHERE a.applicant_id = $1 ORDER BY a.submission_date DESC LIMIT 1`,
        [id],
      );
      const app = apps[0];
      if (!app) throw new AppError(404, 'NO_APPLICATION', 'This applicant has no application.');
      if (app.category_id !== changes.applicationCategoryId) {
        if (Number(app.documents) > 0) {
          throw new AppError(409, 'HAS_DOCUMENTS', 'The applicant has already uploaded documents for their current category, so it cannot be changed.', {
            applicationCategoryId: 'The applicant has already uploaded documents.',
          });
        }
        await client.query('UPDATE applications SET category_id = $2, updated_at = now() WHERE id = $1', [app.id, changes.applicationCategoryId]);
        await recomputeApplicationStatus({ applicationId: app.id }, client);
      }
    }

    // Never write the password itself to the audit log.
    const { password, ...logged } = changes;
    await recordAudit(
      {
        actorId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        details: {
          email: user.email,
          before: { role: user.role, isActive: user.is_active, assignedCategoryId: user.assigned_category_id },
          changes: { ...logged, ...(password ? { passwordReset: true } : {}) },
        },
      },
      client,
    );
    return getUser(id, client);
  });
}
