// AuthService (class diagram): authenticate(), authorize() via middleware, endSession() via cookie clear.
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../../config/db.js';
import { env } from '../../config/env.js';
import { APPLICATION_STATUS, ROLES } from '../../config/constants.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getSetting } from '../../services/settings.js';

const BCRYPT_ROUNDS = 10;
// Compared against when the email is unknown, so both failure paths take similar time.
const DUMMY_HASH = bcrypt.hashSync('advs-dummy-password', BCRYPT_ROUNDS);

const USER_COLUMNS = 'id, name, email, phone, role, is_active, assigned_category_id, created_at';

export function toPublicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: row.is_active,
    assignedCategoryId: row.assigned_category_id,
    createdAt: row.created_at,
  };
}

export async function findActiveUserById(id) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 AND is_active`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
}

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function formatApplicationNumber(seq, year = new Date().getFullYear()) {
  return `ADM-${year}-${String(seq).padStart(3, '0')}`;
}

/** UC-001 / FR-001: registers an applicant and opens their application in the chosen category. */
export async function registerApplicant({ name, email, phone, password, categoryId }) {
  if (!(await getSetting('registration_open'))) {
    throw new AppError(403, 'REGISTRATION_CLOSED', 'Registration is currently closed.');
  }

  const { rows: categories } = await query('SELECT id FROM categories WHERE id = $1 AND is_active', [categoryId]);
  if (!categories.length) {
    throw new AppError(400, 'INVALID_CATEGORY', 'Select a valid admission category.', {
      categoryId: 'Select a valid admission category.',
    });
  }

  const passwordHash = await hashPassword(password);

  return withTransaction(async (client) => {
    let user;
    try {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${USER_COLUMNS}`,
        [name, email, phone ?? null, passwordHash, ROLES.APPLICANT],
      );
      user = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.', {
          email: 'An account with this email already exists.',
        });
      }
      throw err;
    }

    const { rows: seqRows } = await client.query(`SELECT nextval('application_number_seq') AS seq`);
    await client.query(
      `INSERT INTO applications (application_number, applicant_id, category_id, overall_status)
       VALUES ($1, $2, $3, $4)`,
      [formatApplicationNumber(seqRows[0].seq), user.id, categoryId, APPLICATION_STATUS.PENDING],
    );

    return toPublicUser(user);
  });
}

/** UC-002 / FR-002, FR-003: same generic error for unknown email, wrong password or inactive account. */
export async function authenticate(email, password) {
  const { rows } = await query(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = $1`, [email]);
  const row = rows[0];
  const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);

  if (!row || !passwordOk || !row.is_active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  return toPublicUser(row);
}
