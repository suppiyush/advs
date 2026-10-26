// UC-005 Upload Document, UC-012 Resubmit: FR-011-015, BR-001, BR-006, BR-007, AC-01-05, NFR-006.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { pool } from '../src/config/db.js';
import {
  app,
  cleanupUsers,
  createTestCategory,
  createUser,
  deleteTestCategory,
  files,
  loginAs,
  registerApplicant,
  upload,
} from './helpers.js';

let category;
let otherCategory;
let applicant;
let otherApplicant;

const itemOf = (application, itemId) => application.checklist.find((i) => i.id === itemId);

async function setStatus(documentId, status, remarks = null) {
  await pool.query('UPDATE documents SET status = $2, remarks = $3 WHERE id = $1', [documentId, status, remarks]);
}

beforeAll(async () => {
  category = await createTestCategory([
    ['marksheet', 'Class X Marksheet'],
    ['photo', 'Passport Photo'],
    ['optional', 'Sports Certificate', false],
  ]);
  otherCategory = await createTestCategory([['id', 'Identity Proof']]);
  await createUser('verifier', 'VERIFIER', { assignedCategoryId: category.id });
  await createUser('otherverifier', 'VERIFIER', { assignedCategoryId: otherCategory.id });
  await createUser('admin', 'ADMINISTRATOR');
  applicant = await registerApplicant('applicant', category.id);
  otherApplicant = await registerApplicant('other', category.id);
});

afterAll(async () => {
  await cleanupUsers();
  await deleteTestCategory(category.code);
  await deleteTestCategory(otherCategory.code);
  await pool.end();
});

describe('upload preconditions', () => {
  it('requires an authenticated applicant (AC-01, BR-001)', async () => {
    expect((await upload(request(app), category.items.marksheet, files.pdf())).status).toBe(401);
    const verifier = await loginAs('verifier');
    expect((await upload(verifier, category.items.marksheet, files.pdf())).status).toBe(403);
  });

  it('only accepts items from the applicant’s own category (AC-02)', async () => {
    const res = await upload(applicant, otherCategory.items.id, files.pdf());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ITEM');
  });

  it('blocks uploads while the application has no category (BR-006)', async () => {
    const appId = (await otherApplicant.get('/api/applications/me')).body.application.id;
    await pool.query('UPDATE applications SET category_id = NULL WHERE id = $1', [appId]);
    try {
      const res = await upload(otherApplicant, category.items.marksheet, files.pdf());
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('NO_CATEGORY');
    } finally {
      await pool.query('UPDATE applications SET category_id = $2 WHERE id = $1', [appId, category.id]);
    }
  });

  it('requires a checklist item and a file', async () => {
    expect((await upload(applicant, undefined, files.pdf())).status).toBe(400);
    const noFile = await upload(applicant, category.items.marksheet, null);
    expect(noFile.status).toBe(400);
    expect(noFile.body.error.code).toBe('NO_FILE');
  });
});

describe('file validation (FR-015, AC-03)', () => {
  it('rejects a file whose content is not really PDF, JPG or PNG, whatever its name says', async () => {
    const res = await upload(applicant, category.items.marksheet, Buffer.from('just some text'), { name: 'marks.pdf' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields.file).toMatch(/PDF, JPG or PNG/);
  });

  it('rejects empty files and files over the configured size limit', async () => {
    const empty = await upload(applicant, category.items.marksheet, Buffer.alloc(0));
    expect(empty.status).toBe(422);

    const maxMb = (await pool.query(`SELECT value FROM system_settings WHERE key = 'max_upload_mb'`)).rows[0]?.value ?? 5;
    const tooBig = Buffer.concat([files.pdf(), Buffer.alloc(maxMb * 1024 * 1024)]);
    const res = await upload(applicant, category.items.marksheet, tooBig);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/maximum size/);
  });

  it('stores nothing when validation fails', async () => {
    const { body } = await applicant.get('/api/applications/me');
    expect(itemOf(body.application, category.items.marksheet).status).toBe('MISSING');
  });
});

describe('uploading (FR-011, FR-012, AC-04, AC-05)', () => {
  it('stores the document as Pending and updates the missing list straight away', async () => {
    const res = await upload(applicant, category.items.marksheet, files.pdf('v1'), { name: 'class-x.pdf' });
    expect(res.status).toBe(201);
    expect(res.body.result).toMatchObject({ action: 'UPLOADED', version: 1, documentType: 'Class X Marksheet' });

    const item = itemOf(res.body.application, category.items.marksheet);
    expect(item.status).toBe('PENDING');
    expect(item.document.fileName).toBe('class-x.pdf');
    expect(res.body.application.missing.map((m) => m.id)).toEqual([category.items.photo]);
    expect(res.body.application.overallStatus).toBe('PENDING');
  });

  it('accepts images and moves the application to Under Review once every mandatory item is uploaded', async () => {
    const res = await upload(applicant, category.items.photo, files.png(), { name: 'photo.png', type: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.application.missing).toEqual([]);
    expect(res.body.application.overallStatus).toBe('UNDER_REVIEW');
  });

  it('records the real type even if the browser claims another', async () => {
    const res = await upload(applicant, category.items.optional, files.jpg(), { name: 'cert.jpg', type: 'application/pdf' });
    expect(res.status).toBe(201);
    const { body } = await applicant.get(`/api/documents/${res.body.result.documentId}`);
    expect(body.document.mimeType).toBe('image/jpeg');
  });
});

describe('replace and resubmit rules (FR-013, BR-007)', () => {
  let documentId;

  it('asks for confirmation before replacing a pending document', async () => {
    const res = await upload(applicant, category.items.marksheet, files.pdf('v2'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFIRM_REPLACE');
  });

  it('replaces a pending document after confirmation and keeps the old version', async () => {
    const res = await upload(applicant, category.items.marksheet, files.pdf('v2'), { name: 'class-x-v2.pdf', confirmReplace: true });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ action: 'REPLACED', version: 2 });
    documentId = res.body.result.documentId;

    const { body } = await applicant.get(`/api/documents/${documentId}`);
    expect(body.document.versions.map((v) => v.fileName)).toEqual(['class-x-v2.pdf', 'class-x.pdf']);
    expect(body.document.history.map((h) => h.type)).toEqual(['NEW_VERSION', 'UPLOADED']);
  });

  it('lets the applicant resubmit a rejected document, which goes back to Pending', async () => {
    await setStatus(documentId, 'REJECTED', 'Blurred scan');
    const res = await upload(applicant, category.items.marksheet, files.pdf('v3'), { name: 'class-x-v3.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ action: 'RESUBMITTED', version: 3 });

    const item = itemOf(res.body.application, category.items.marksheet);
    expect(item.status).toBe('PENDING');
    expect(item.document.remarks).toBeNull();
  });

  it('refuses to change a verified document, even with confirmation', async () => {
    await setStatus(documentId, 'VERIFIED');
    const res = await upload(applicant, category.items.marksheet, files.pdf('v4'), { confirmReplace: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DOCUMENT_LOCKED');
  });
});

describe('downloading and access (NFR-006, NFR-018)', () => {
  let documentId;

  beforeAll(async () => {
    const { body } = await applicant.get('/api/applications/me');
    documentId = itemOf(body.application, category.items.marksheet).document.id;
  });

  it('streams the current file and earlier versions to the owner', async () => {
    const current = await applicant.get(`/api/documents/${documentId}/file`).buffer(true);
    expect(current.status).toBe(200);
    expect(current.headers['content-type']).toBe('application/pdf');
    expect(current.body.toString()).toContain('v3');

    const first = await applicant.get(`/api/documents/${documentId}/file?version=1`).buffer(true);
    expect(first.body.toString()).toContain('v1');
    expect((await applicant.get(`/api/documents/${documentId}/file?version=9`)).status).toBe(404);
  });

  it('allows the category’s verifier and administrators', async () => {
    for (const name of ['verifier', 'admin']) {
      const agent = await loginAs(name);
      expect((await agent.get(`/api/documents/${documentId}/file`)).status).toBe(200);
      expect((await agent.get(`/api/documents/${documentId}`)).status).toBe(200);
    }
  });

  it('hides the document from other applicants and from verifiers of other categories', async () => {
    const otherVerifier = await loginAs('otherverifier');
    for (const agent of [otherApplicant, otherVerifier, request(app)]) {
      const res = await agent.get(`/api/documents/${documentId}/file`);
      expect([401, 404]).toContain(res.status);
      expect(res.headers['content-type']).not.toBe('application/pdf');
    }
  });
});
