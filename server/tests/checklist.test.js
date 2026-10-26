// FR-007-010, FR-021-023, FR-033, BR-005, BR-008, AC-11-14, UC-004/006.
// Works on its own throwaway category and users, deleted afterwards.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../src/config/db.js';
import { app, cleanupUsers, createUser, loginAs, registerApplicant, runId } from './helpers.js';

const code = `CAT-T${Date.now().toString(36).toUpperCase()}`.slice(0, 14);
const categoryName = `Test Category ${runId}`;
let admin;
let categoryId;
const itemIds = {};

/** Stands in for Increment 3's upload: gives the applicant a document with this status. */
async function setDocument(applicant, itemId, status) {
  const { body } = await applicant.get('/api/applications/me');
  await pool.query(
    `INSERT INTO documents (application_id, checklist_item_id, file_name, file_path, mime_type, size_bytes, status, remarks)
     VALUES ($1, $2, 'test.pdf', 'test/test.pdf', 'application/pdf', 100, $3, $4)
     ON CONFLICT (application_id, checklist_item_id) DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks`,
    [body.application.id, itemId, status, status === 'REJECTED' ? 'Blurred scan' : null],
  );
  // Status is normally recomputed by the upload/verification services.
  const { recomputeApplicationStatus } = await import('../src/modules/documents/document.service.js');
  await recomputeApplicationStatus({ applicationId: body.application.id });
}

async function myApplication(agent) {
  const res = await agent.get('/api/applications/me');
  expect(res.status).toBe(200);
  return res.body.application;
}

beforeAll(async () => {
  await createUser('admin', 'ADMINISTRATOR');
  await createUser('verifier', 'VERIFIER');
  admin = await loginAs('admin');
});

afterAll(async () => {
  await cleanupUsers();
  await pool.query('DELETE FROM categories WHERE code = $1', [code]);
  await pool.end();
});

describe('category management (FR-007, FR-033)', () => {
  it('creates a category with a normalised code', async () => {
    const res = await admin
      .post('/api/admin/categories')
      .send({ code: code.toLowerCase(), name: categoryName, description: 'Created by tests' });
    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({ code, name: categoryName, isActive: true });
    categoryId = res.body.category.id;
  });

  it('rejects a duplicate code and an invalid code', async () => {
    const dup = await admin.post('/api/admin/categories').send({ code, name: `${categoryName} 2` });
    expect(dup.status).toBe(409);

    const dupName = await admin.post('/api/admin/categories').send({ code: 'CAT-ZZDUP', name: categoryName.toUpperCase() });
    expect(dupName.status).toBe(409);
    expect(dupName.body.error.fields.name).toBeDefined();

    const bad = await admin.post('/api/admin/categories').send({ code: 'GENERAL', name: 'Bad code' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields.code).toBeDefined();
  });

  it('lists every category with counts for the administrator', async () => {
    const res = await admin.get('/api/admin/categories');
    expect(res.status).toBe(200);
    const created = res.body.categories.find((c) => c.id === categoryId);
    expect(created).toMatchObject({ itemCount: 0, mandatoryCount: 0, applicationCount: 0 });
  });

  it('records category changes in the audit log (FR-035)', async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'category' AND entity_id = $1`,
      [String(categoryId)],
    );
    expect(rows.map((r) => r.action)).toContain('CATEGORY_CREATED');
  });
});

describe('checklist configuration (FR-008, FR-009)', () => {
  it('adds mandatory and optional checklist items', async () => {
    for (const [key, documentType, isMandatory] of [
      ['marksheet', 'Class X Marksheet', true],
      ['photo', 'Passport Photo', true],
      ['extra', 'Sports Certificate', false],
    ]) {
      const res = await admin.post(`/api/admin/categories/${categoryId}/checklist`).send({ documentType, isMandatory });
      expect(res.status).toBe(201);
      itemIds[key] = res.body.item.id;
    }
    const res = await admin.get(`/api/admin/categories/${categoryId}`);
    expect(res.body.category.checklist).toHaveLength(3);
  });

  it('rejects a duplicate document type in the same category, ignoring case', async () => {
    for (const documentType of ['Passport Photo', 'passport PHOTO']) {
      const res = await admin.post(`/api/admin/categories/${categoryId}/checklist`).send({ documentType, isMandatory: true });
      expect(res.status).toBe(409);
      expect(res.body.error.fields.documentType).toBeDefined();
    }
    const rename = await admin.patch(`/api/admin/checklist-items/${itemIds.extra}`).send({ documentType: 'class x marksheet' });
    expect(rename.status).toBe(409);
  });

  it('only lets administrators change checklists (BR-008)', async () => {
    const verifier = await loginAs('verifier');
    const res = await verifier
      .post(`/api/admin/categories/${categoryId}/checklist`)
      .send({ documentType: 'Anything', isMandatory: true });
    expect(res.status).toBe(403);
    expect((await verifier.patch(`/api/admin/checklist-items/${itemIds.photo}`).send({ isMandatory: false })).status).toBe(403);
  });

  it('returns 404 for an unknown category and 400 for a bad id', async () => {
    expect((await admin.get('/api/admin/categories/999999')).status).toBe(404);
    expect((await admin.get('/api/admin/categories/abc')).status).toBe(400);
  });
});

describe('applicant checklist and missing documents (FR-010, FR-021-023)', () => {
  let applicant;

  beforeAll(async () => {
    applicant = await registerApplicant('applicant', categoryId);
  });

  it('shows the checklist of the applicant’s category, with every mandatory item missing', async () => {
    const application = await myApplication(applicant);
    expect(application.checklist.map((i) => i.documentType)).toEqual([
      'Class X Marksheet',
      'Passport Photo',
      'Sports Certificate',
    ]);
    expect(application.checklist.every((i) => i.status === 'MISSING')).toBe(true);
    // Optional items are never "missing" (AC-12)
    expect(application.missing.map((m) => m.documentType)).toEqual(['Class X Marksheet', 'Passport Photo']);
    expect(application).toMatchObject({ overallStatus: 'PENDING', isComplete: false });
  });

  it('does not list pending or verified documents as missing, but lists rejected ones (AC-13, AC-14)', async () => {
    await setDocument(applicant, itemIds.marksheet, 'PENDING');
    let application = await myApplication(applicant);
    expect(application.missing.map((m) => m.id)).toEqual([itemIds.photo]);

    await setDocument(applicant, itemIds.photo, 'VERIFIED');
    application = await myApplication(applicant);
    expect(application.missing).toEqual([]);
    expect(application.overallStatus).toBe('UNDER_REVIEW');

    await setDocument(applicant, itemIds.marksheet, 'REJECTED');
    application = await myApplication(applicant);
    expect(application.missing).toEqual([{ id: itemIds.marksheet, documentType: 'Class X Marksheet', status: 'REJECTED' }]);
    expect(application.overallStatus).toBe('REJECTED');
  });

  it('completes the application only when every mandatory document is verified (BR-005)', async () => {
    await setDocument(applicant, itemIds.marksheet, 'VERIFIED');
    const application = await myApplication(applicant);
    expect(application).toMatchObject({ overallStatus: 'COMPLETED', isComplete: true });
    expect(application.progress).toEqual({ mandatoryTotal: 2, verified: 2, uploaded: 2 });
  });

  it('reopens completed applications when a new mandatory item is added, and closes them when it is made optional', async () => {
    const add = await admin
      .post(`/api/admin/categories/${categoryId}/checklist`)
      .send({ documentType: 'Income Certificate', isMandatory: true });
    expect(add.status).toBe(201);
    itemIds.income = add.body.item.id;
    expect((await myApplication(applicant)).overallStatus).toBe('PENDING');

    const optional = await admin.patch(`/api/admin/checklist-items/${itemIds.income}`).send({ isMandatory: false });
    expect(optional.status).toBe(200);
    expect((await myApplication(applicant)).overallStatus).toBe('COMPLETED');
  });

  it('refuses to remove an item that applicants have uploaded against, but removes unused ones', async () => {
    const inUse = await admin.delete(`/api/admin/checklist-items/${itemIds.marksheet}`);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('ITEM_IN_USE');

    expect((await admin.delete(`/api/admin/checklist-items/${itemIds.income}`)).status).toBe(204);
    const application = await myApplication(applicant);
    expect(application.checklist.map((i) => i.id)).not.toContain(itemIds.income);
  });
});

describe('deactivating a category', () => {
  it('hides it from registration but keeps it for the administrator', async () => {
    const res = await admin.patch(`/api/admin/categories/${categoryId}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.category.isActive).toBe(false);

    const publicList = await request(app).get('/api/categories');
    expect(publicList.body.categories.map((c) => c.id)).not.toContain(categoryId);

    const register = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Too Late', email: `late.${runId}@advs.test`, password: 'Test1234pass', categoryId });
    expect(register.status).toBe(400);
  });
});
