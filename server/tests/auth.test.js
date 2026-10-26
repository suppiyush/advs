// FR-001-006, BR-006, UC-001/002. Creates only throwaway users (…@advs.test) and deletes them afterwards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../src/config/db.js';
import { PASSWORD, app, cleanupUsers, createUser, emailFor, loginAs } from './helpers.js';

let categoryId;

beforeAll(async () => {
  const res = await request(app).get('/api/categories');
  expect(res.status).toBe(200);
  expect(res.body.categories.length).toBeGreaterThan(0); // run `npm run seed` first
  categoryId = res.body.categories[0].id;

  await createUser('admin', 'ADMINISTRATOR');
  await createUser('verifier', 'VERIFIER');
  await createUser('inactive', 'APPLICANT', { isActive: false });
});

afterAll(async () => {
  await cleanupUsers();
  await pool.end();
});

describe('registration (FR-001)', () => {
  it('registers an applicant, starts a session and opens an application in the chosen category', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send({
      name: 'New Applicant',
      email: emailFor('applicant').toUpperCase(),
      password: PASSWORD,
      categoryId,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'APPLICANT', email: emailFor('applicant') });
    expect(res.body.user.password_hash).toBeUndefined();

    const app1 = await agent.get('/api/applications/me');
    expect(app1.status).toBe(200);
    expect(app1.body.application.applicationNumber).toMatch(/^ADM-\d{4}-\d{3,}$/);
    expect(app1.body.application.overallStatus).toBe('PENDING');
    expect(app1.body.application.category.id).toBe(categoryId);
  });

  it('rejects a duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Dup', email: emailFor('applicant'), password: PASSWORD, categoryId });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toBeDefined();
  });

  it('returns field errors for invalid input', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields)).toEqual(
      expect.arrayContaining(['name', 'email', 'password', 'categoryId']),
    );
  });

  it('rejects an unknown category (BR-006)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Cat Test', email: emailFor('nocat'), password: PASSWORD, categoryId: 999999 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CATEGORY');
  });
});

describe('login and logout (FR-002-004)', () => {
  it('uses the same generic message for wrong password, unknown email and inactive account', async () => {
    const attempts = [
      { email: emailFor('admin'), password: 'wrong-password1' },
      { email: emailFor('nobody'), password: PASSWORD },
      { email: emailFor('inactive'), password: PASSWORD },
    ];
    for (const body of attempts) {
      const res = await request(app).post('/api/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password.');
    }
  });

  it('sets an httpOnly cookie and ends the session on logout', async () => {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email: emailFor('admin'), password: PASSWORD });
    expect(login.headers['set-cookie'][0]).toMatch(/advs_token=.+HttpOnly/i);

    expect((await agent.get('/api/auth/me')).body.user.role).toBe('ADMINISTRATOR');
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('locks out an email after 10 failed logins from the same address, without affecting others', async () => {
    const attempt = (email, password) => request(app).post('/api/auth/login').send({ email, password });
    for (let i = 0; i < 10; i++) {
      expect((await attempt(emailFor('throttled'), 'wrong-password1')).status).toBe(401);
    }
    const blocked = await attempt(emailFor('throttled'), 'wrong-password1');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_ATTEMPTS');
    // Other accounts can still log in.
    expect((await attempt(emailFor('admin'), PASSWORD)).status).toBe(200);
  });

  it('requires a session for protected routes (NFR-004)', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });
});

describe('role-based access (FR-006, NFR-005)', () => {
  it('lets only administrators list users', async () => {
    const admin = await loginAs('admin');
    expect((await admin.get('/api/admin/users')).status).toBe(200);

    const applicant = request.agent(app);
    await applicant.post('/api/auth/login').send({ email: emailFor('applicant'), password: PASSWORD });
    expect((await applicant.get('/api/admin/users')).status).toBe(403);
  });

  it('lets only applicants open their application', async () => {
    const verifier = await loginAs('verifier');
    expect((await verifier.get('/api/applications/me')).status).toBe(403);
  });

  it('logs out a user immediately once deactivated', async () => {
    const agent = await loginAs('verifier');
    await pool.query('UPDATE users SET is_active = false WHERE email = $1', [emailFor('verifier')]);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
