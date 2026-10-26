// UC-008 View Pending Cases, UC-009 Verify, UC-010 Reject, UC-011 Add Remarks:
// FR-016-020, FR-028, BR-002-004, AC-06-09.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/config/db.js';
import {
  cleanupUsers,
  createTestCategory,
  createUser,
  deleteTestCategory,
  files,
  loginAs,
  registerApplicant,
  upload,
} from './helpers.js';

let catA;
let catB;
const agents = {};
const docs = {};
let aliceApplicationId;

async function myApplication(agent) {
  return (await agent.get('/api/applications/me')).body.application;
}

async function uploadAndGetId(applicantAgent, itemId, text, options) {
  const res = await upload(applicantAgent, itemId, files.pdf(text), options);
  expect([200, 201]).toContain(res.status);
  return res.body.result.documentId;
}

const decide = (agent, documentId, body) => agent.post(`/api/documents/${documentId}/decision`).send(body);
const pending = async (agent, query = '') => (await agent.get(`/api/verification/pending${query}`)).body;

beforeAll(async () => {
  catA = await createTestCategory([
    ['marksheet', 'Class X Marksheet'],
    ['photo', 'Passport Photo'],
  ]);
  catB = await createTestCategory([['id', 'Identity Proof']]);

  await createUser('verA', 'VERIFIER', { assignedCategoryId: catA.id });
  await createUser('verA2', 'VERIFIER', { assignedCategoryId: catA.id });
  await createUser('verB', 'VERIFIER', { assignedCategoryId: catB.id });
  await createUser('verNone', 'VERIFIER');
  await createUser('admin', 'ADMINISTRATOR');
  for (const name of ['verA', 'verA2', 'verB', 'verNone', 'admin']) agents[name] = await loginAs(name);

  agents.alice = await registerApplicant('alice', catA.id);
  agents.bob = await registerApplicant('bob', catA.id);
  agents.carol = await registerApplicant('carol', catB.id);

  // Upload order matters: the dashboard lists the oldest first.
  docs.aliceMarksheet = await uploadAndGetId(agents.alice, catA.items.marksheet, 'alice-marksheet');
  docs.alicePhoto = await uploadAndGetId(agents.alice, catA.items.photo, 'alice-photo');
  docs.bobMarksheet = await uploadAndGetId(agents.bob, catA.items.marksheet, 'bob-marksheet');
  docs.carolId = await uploadAndGetId(agents.carol, catB.items.id, 'carol-id');
  aliceApplicationId = (await myApplication(agents.alice)).id;
});

afterAll(async () => {
  await cleanupUsers();
  await deleteTestCategory(catA.code);
  await deleteTestCategory(catB.code);
  await pool.end();
});

describe('pending-cases dashboard (UC-008, FR-016, FR-028)', () => {
  it('lists pending documents of the verifier’s category, oldest upload first', async () => {
    const { cases } = await pending(agents.verA);
    expect(cases.map((c) => c.documentId)).toEqual([docs.aliceMarksheet, docs.alicePhoto, docs.bobMarksheet]);
    expect(cases[0]).toMatchObject({
      documentType: 'Class X Marksheet',
      version: 1,
      application: { applicantName: 'Applicant alice' },
      category: { id: catA.id },
    });
  });

  it('keeps each verifier to their own category', async () => {
    const { cases } = await pending(agents.verB);
    expect(cases.map((c) => c.documentId)).toEqual([docs.carolId]);
  });

  it('shows an empty list, flagged, to a verifier without a category', async () => {
    expect(await pending(agents.verNone)).toEqual({ noCategoryAssigned: true, cases: [] });
  });

  it('shows administrators every category, with an optional category filter', async () => {
    const all = (await pending(agents.admin)).cases.map((c) => c.documentId);
    expect(all).toEqual(expect.arrayContaining(Object.values(docs)));
    const onlyB = (await pending(agents.admin, `?categoryId=${catB.id}`)).cases.map((c) => c.documentId);
    expect(onlyB).toEqual([docs.carolId]);
  });

  it('searches by applicant name or application number', async () => {
    expect((await pending(agents.verA, '?search=BOB')).cases.map((c) => c.documentId)).toEqual([docs.bobMarksheet]);
    const number = (await myApplication(agents.alice)).applicationNumber;
    expect((await pending(agents.verA, `?search=${number}`)).cases).toHaveLength(2);
  });

  it('is not available to applicants', async () => {
    expect((await agents.alice.get('/api/verification/pending')).status).toBe(403);
  });
});

describe('recording decisions (UC-009/010/011, FR-017, FR-018)', () => {
  it('only lets verifiers of the document’s category decide (AC-06, BR-002)', async () => {
    expect((await decide(agents.alice, docs.aliceMarksheet, { status: 'VERIFIED' })).status).toBe(403);
    expect((await decide(agents.admin, docs.aliceMarksheet, { status: 'VERIFIED' })).status).toBe(403);
    expect((await decide(agents.verB, docs.aliceMarksheet, { status: 'VERIFIED' })).status).toBe(404);
  });

  it('requires a remark to reject or to keep a document pending (AC-08, BR-004)', async () => {
    for (const status of ['REJECTED', 'PENDING']) {
      const res = await decide(agents.verA, docs.aliceMarksheet, { status, remarks: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error.fields.remarks).toBeDefined();
    }
    expect((await decide(agents.verA, docs.aliceMarksheet, { status: 'APPROVED' })).status).toBe(400);
  });

  it('verifies a document, removes it from the dashboard and updates the application (AC-09)', async () => {
    const res = await decide(agents.verA, docs.aliceMarksheet, { status: 'VERIFIED', version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.decision.status).toBe('VERIFIED');

    expect((await pending(agents.verA)).cases.map((c) => c.documentId)).not.toContain(docs.aliceMarksheet);
    const application = await myApplication(agents.alice);
    expect(application.checklist.find((i) => i.id === catA.items.marksheet).status).toBe('VERIFIED');
    expect(application.overallStatus).toBe('UNDER_REVIEW');
  });

  it('refuses a second decision on a decided document (UC-009 duplicate action)', async () => {
    const res = await decide(agents.verA2, docs.aliceMarksheet, { status: 'REJECTED', remarks: 'Late reject' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_DECIDED');
    expect(res.body.error.message).toMatch(/another staff member/);
  });

  it('lets exactly one of two simultaneous decisions through', async () => {
    const results = await Promise.all([
      decide(agents.verA, docs.bobMarksheet, { status: 'VERIFIED' }),
      decide(agents.verA2, docs.bobMarksheet, { status: 'REJECTED', remarks: 'Wrong document' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const { rows } = await pool.query('SELECT count(*) FROM verification_records WHERE document_id = $1', [docs.bobMarksheet]);
    expect(Number(rows[0].count)).toBe(1);
  });

  it('refuses a decision on a file the applicant replaced during the review', async () => {
    await upload(agents.alice, catA.items.photo, files.pdf('alice-photo-v2'), { confirmReplace: true });
    const stale = await decide(agents.verA, docs.alicePhoto, { status: 'VERIFIED', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('DOCUMENT_CHANGED');
  });

  it('keeps a document pending with a remark the applicant can see (UC-011)', async () => {
    const res = await decide(agents.verA, docs.alicePhoto, { status: 'PENDING', remarks: 'Please confirm this is a recent photo.', version: 2 });
    expect(res.status).toBe(200);

    const photo = (await myApplication(agents.alice)).checklist.find((i) => i.id === catA.items.photo);
    expect(photo).toMatchObject({ status: 'PENDING', document: { remarks: 'Please confirm this is a recent photo.' } });
    const stillPending = (await pending(agents.verA)).cases.find((c) => c.documentId === docs.alicePhoto);
    expect(stillPending.remarks).toBe('Please confirm this is a recent photo.');
  });

  it('rejects with a reason, which reopens the item as missing for the applicant (UC-010)', async () => {
    const res = await decide(agents.verA, docs.alicePhoto, { status: 'REJECTED', remarks: 'Face not clearly visible.' });
    expect(res.status).toBe(200);

    const application = await myApplication(agents.alice);
    expect(application.missing).toEqual([{ id: catA.items.photo, documentType: 'Passport Photo', status: 'REJECTED' }]);
    expect(application.overallStatus).toBe('REJECTED');
  });

  it('keeps the history of every decision for the document (FR-020)', async () => {
    const { body } = await agents.verA.get(`/api/documents/${docs.alicePhoto}`);
    const decisions = body.document.history.filter((h) => h.type === 'DECISION');
    expect(decisions.map((d) => [d.status, d.remarks])).toEqual([
      ['REJECTED', 'Face not clearly visible.'],
      ['PENDING', 'Please confirm this is a recent photo.'],
    ]);
    expect(decisions[0].by).toBe('verA');
  });

  it('writes decisions to the audit log (NFR-020)', async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'document' AND entity_id = $1 ORDER BY id`,
      [String(docs.alicePhoto)],
    );
    expect(rows.map((r) => r.action)).toEqual(['REMARK_ADDED', 'DOCUMENT_REJECTED']);
  });
});

describe('administrator corrections (FR-019)', () => {
  const correct = (agent, id, body) => agent.post(`/api/documents/${id}/correction`).send(body);

  it('is only available to administrators, with a reason, on decided documents', async () => {
    expect((await correct(agents.verA, docs.aliceMarksheet, { status: 'PENDING', reason: 'Recheck please' })).status).toBe(403);
    expect((await correct(agents.admin, docs.aliceMarksheet, { status: 'PENDING' })).status).toBe(400);
    const notDecided = await correct(agents.admin, docs.carolId, { status: 'VERIFIED', reason: 'Looks fine to me' });
    expect(notDecided.status).toBe(409);
    expect(notDecided.body.error.code).toBe('NOT_DECIDED');
    expect((await correct(agents.admin, docs.aliceMarksheet, { status: 'VERIFIED', reason: 'No change at all' })).status).toBe(400);
  });

  it('reopens a verified document for review and records the correction', async () => {
    const res = await correct(agents.admin, docs.aliceMarksheet, { status: 'PENDING', reason: 'Verified against the wrong board result.' });
    expect(res.status).toBe(200);

    expect((await pending(agents.verA)).cases.map((c) => c.documentId)).toContain(docs.aliceMarksheet);
    const { body } = await agents.admin.get(`/api/documents/${docs.aliceMarksheet}`);
    expect(body.document.history[0]).toMatchObject({ type: 'CORRECTED', status: 'PENDING', by: 'admin' });
  });
});

describe('application view for staff (UC-009 "select applicant")', () => {
  it('lists applications in the verifier’s category with document counts', async () => {
    const { body } = await agents.verA.get('/api/verification/applications');
    const names = body.applications.map((a) => a.applicantName);
    expect(names).toEqual(expect.arrayContaining(['Applicant alice', 'Applicant bob']));
    expect(names).not.toContain('Applicant carol');
  });

  it('shows one application with applicant details and checklist, only within scope', async () => {
    const res = await agents.verA.get(`/api/verification/applications/${aliceApplicationId}`);
    expect(res.status).toBe(200);
    expect(res.body.application.applicant.email).toMatch(/^alice\./);
    expect(res.body.application.checklist).toHaveLength(2);
    expect((await agents.verB.get(`/api/verification/applications/${aliceApplicationId}`)).status).toBe(404);
  });
});
