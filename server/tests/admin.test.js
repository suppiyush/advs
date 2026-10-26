// UC-003 Manage Users, Manage System Configuration, UC-014/015 dashboards and reports:
// FR-005, FR-029-032, FR-034, FR-035, BR-010.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../src/config/db.js';
import {
  PASSWORD,
  app,
  cleanupUsers,
  createTestCategory,
  createUser,
  deleteTestCategory,
  emailFor,
  files,
  loginAs,
  registerApplicant,
  upload,
} from './helpers.js';

let cat;
let otherCat;
let admin;
let adminId;
let verifier;
let applicantAgent;
let applicantUserId;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  cat = await createTestCategory([['marksheet', 'Class X Marksheet']]);
  otherCat = await createTestCategory([['id', 'Identity Proof']]);
  adminId = await createUser('admin', 'ADMINISTRATOR');
  await createUser('verifier', 'VERIFIER', { assignedCategoryId: cat.id });
  admin = await loginAs('admin');
  verifier = await loginAs('verifier');
  applicantAgent = await registerApplicant('applicant', cat.id);
  applicantUserId = (await applicantAgent.get('/api/auth/me')).body.user.id;
});

afterAll(async () => {
  await cleanupUsers();
  await deleteTestCategory(cat.code);
  await deleteTestCategory(otherCat.code);
  await pool.end();
});

describe('user management (FR-005, FR-032)', () => {
  let staffId;

  it('is only available to administrators', async () => {
    expect((await verifier.get('/api/admin/users')).status).toBe(403);
    expect((await applicantAgent.post('/api/admin/users').send({})).status).toBe(403);
  });

  it('creates a verifier with a category, who can then log in', async () => {
    const res = await admin.post('/api/admin/users').send({
      name: 'New Verifier',
      email: emailFor('newstaff').toUpperCase(),
      role: 'VERIFIER',
      assignedCategoryId: cat.id,
      password: PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: emailFor('newstaff'), role: 'VERIFIER', assignedCategoryId: cat.id, isActive: true });
    staffId = res.body.user.id;
    expect((await request(app).post('/api/auth/login').send({ email: emailFor('newstaff'), password: PASSWORD })).status).toBe(200);
  });

  it('rejects duplicate emails, applicant accounts and categories for administrators', async () => {
    const dup = await admin.post('/api/admin/users').send({ name: 'Dup', email: emailFor('newstaff'), role: 'VERIFIER', password: PASSWORD });
    expect(dup.status).toBe(409);
    const applicant = await admin.post('/api/admin/users').send({ name: 'Appl', email: emailFor('x1'), role: 'APPLICANT', password: PASSWORD });
    expect(applicant.status).toBe(400);
    const adminWithCat = await admin
      .post('/api/admin/users')
      .send({ name: 'Admin Two', email: emailFor('x2'), role: 'ADMINISTRATOR', assignedCategoryId: cat.id, password: PASSWORD });
    expect(adminWithCat.status).toBe(400);
  });

  it('lists and searches users', async () => {
    const res = await admin.get(`/api/admin/users?search=${encodeURIComponent(emailFor('newstaff'))}`);
    expect(res.body.users.map((u) => u.id)).toEqual([staffId]);
    const verifiers = await admin.get('/api/admin/users?role=VERIFIER');
    expect(verifiers.body.users.every((u) => u.role === 'VERIFIER')).toBe(true);
  });

  it('moves a verifier to another category and promotes them, which clears the category', async () => {
    const moved = await admin.patch(`/api/admin/users/${staffId}`).send({ assignedCategoryId: otherCat.id });
    expect(moved.body.user.assignedCategoryId).toBe(otherCat.id);
    const promoted = await admin.patch(`/api/admin/users/${staffId}`).send({ role: 'ADMINISTRATOR' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user).toMatchObject({ role: 'ADMINISTRATOR', assignedCategoryId: null });
  });

  it('only changes roles between verifier and administrator', async () => {
    const res = await admin.patch(`/api/admin/users/${applicantUserId}`).send({ role: 'VERIFIER' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
  });

  it('resets a password and deactivates an account, which ends its access', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: emailFor('newstaff'), password: PASSWORD });

    expect((await admin.patch(`/api/admin/users/${staffId}`).send({ password: 'Brand9new' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: emailFor('newstaff'), password: 'Brand9new' })).status).toBe(200);

    expect((await admin.patch(`/api/admin/users/${staffId}`).send({ isActive: false })).body.user.isActive).toBe(false);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('stops administrators from locking themselves out', async () => {
    for (const change of [{ isActive: false }, { role: 'VERIFIER' }]) {
      const res = await admin.patch(`/api/admin/users/${adminId}`).send(change);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('SELF_LOCKOUT');
    }
  });

  it('changes an applicant’s category only while nothing is uploaded', async () => {
    const moved = await admin.patch(`/api/admin/users/${applicantUserId}`).send({ applicationCategoryId: otherCat.id });
    expect(moved.status).toBe(200);
    expect(moved.body.user.application.categoryId).toBe(otherCat.id);

    expect((await upload(applicantAgent, otherCat.items.id, files.pdf())).status).toBe(201);
    const refused = await admin.patch(`/api/admin/users/${applicantUserId}`).send({ applicationCategoryId: cat.id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('HAS_DOCUMENTS');
  });

  it('writes user changes to the audit log without passwords (FR-035)', async () => {
    const { rows } = await pool.query(
      `SELECT action, details FROM audit_logs WHERE entity_type = 'user' AND entity_id = $1 ORDER BY id`,
      [String(staffId)],
    );
    expect(rows[0].action).toBe('USER_CREATED');
    expect(rows.some((r) => r.details.changes?.passwordReset === true)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('Brand9new');
  });
});

describe('system configuration (FR-034)', () => {
  let original;

  beforeAll(async () => {
    original = (await admin.get('/api/admin/settings')).body.settings;
  });

  afterAll(async () => {
    const { registrationOpen, maxUploadMb, allowedMimeTypes } = original;
    await admin.put('/api/admin/settings').send({ registrationOpen, maxUploadMb, allowedMimeTypes });
  });

  it('validates new values', async () => {
    for (const body of [{ maxUploadMb: 0 }, { maxUploadMb: 50 }, { allowedMimeTypes: [] }, { allowedMimeTypes: ['text/plain'] }, {}]) {
      expect((await admin.put('/api/admin/settings').send(body)).status).toBe(400);
    }
    expect((await verifier.put('/api/admin/settings').send({ maxUploadMb: 2 })).status).toBe(403);
  });

  it('closes registration and limits uploads to the chosen formats', async () => {
    const res = await admin.put('/api/admin/settings').send({ registrationOpen: false, allowedMimeTypes: ['application/pdf'] });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({ registrationOpen: false, allowedMimeTypes: ['application/pdf'] });

    const register = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Too Late', email: emailFor('late'), password: PASSWORD, categoryId: cat.id });
    expect(register.status).toBe(403);

    const png = await upload(applicantAgent, otherCat.items.id, files.png(), { name: 'id.png', type: 'image/png' });
    expect([409, 422]).toContain(png.status); // pending document needs confirmation first
    const confirmed = await upload(applicantAgent, otherCat.items.id, files.png(), { name: 'id.png', type: 'image/png', confirmReplace: true });
    expect(confirmed.status).toBe(422);
    expect(confirmed.body.error.fields.file).toMatch(/PDF/);
  });
});

describe('audit log (FR-035)', () => {
  it('lists entries newest first with actor names, filterable by action', async () => {
    const res = await admin.get('/api/admin/audit-logs?action=SETTINGS_UPDATED');
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThan(0);
    expect(res.body.entries.every((e) => e.action === 'SETTINGS_UPDATED')).toBe(true);
    expect(res.body.entries[0].actor.name).toBe('admin');
    expect(res.body.actions).toContain('USER_CREATED');
  });

  it('filters by person and date, and is administrators only', async () => {
    const res = await admin.get(`/api/admin/audit-logs?actorId=${adminId}&from=${today}&to=${today}`);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect((await verifier.get('/api/admin/audit-logs')).status).toBe(403);
  });
});

describe('dashboards and reports (FR-029-031, BR-010)', () => {
  beforeAll(async () => {
    // One decision by the test verifier, in the original test category.
    const second = await registerApplicant('second', cat.id);
    const docId = (await upload(second, cat.items.marksheet, files.pdf())).body.result.documentId;
    expect((await verifier.post(`/api/documents/${docId}/decision`).send({ status: 'REJECTED', remarks: 'Unreadable' })).status).toBe(200);
  });

  it('are only available to administrators', async () => {
    for (const path of ['/api/reports/progress', '/api/reports/category-summary', '/api/reports/verification-activity']) {
      expect((await verifier.get(path)).status).toBe(403);
    }
  });

  it('summarises application progress across categories', async () => {
    const { body } = await admin.get('/api/reports/progress');
    expect(body.applications.total).toBeGreaterThanOrEqual(2);
    expect(body.applications.total).toBe(Object.values(body.applications.byStatus).reduce((a, b) => a + b, 0));
    expect(body.categories.map((c) => c.id)).toEqual(expect.arrayContaining([cat.id, otherCat.id]));
  });

  it('gives a category-wise summary', async () => {
    const { body } = await admin.get('/api/reports/category-summary');
    const row = body.categories.find((c) => c.id === cat.id);
    expect(row).toMatchObject({ applications: { total: 1, rejected: 1 }, documents: { rejected: 1, pending: 0 } });
  });

  it('reports verification activity per verifier for a date range', async () => {
    const res = await admin.get(`/api/reports/verification-activity?from=${today}&to=${today}`);
    const mine = res.body.verifiers.find((v) => v.name === 'verifier');
    expect(mine).toMatchObject({ verified: 0, rejected: 1, remarks: 0, corrections: 0 });

    const old = await admin.get('/api/reports/verification-activity?from=2000-01-01&to=2000-01-31');
    expect(old.body.verifiers).toEqual([]);
    expect((await admin.get('/api/reports/verification-activity?from=yesterday')).status).toBe(400);
  });
});
