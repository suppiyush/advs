// UC-013 Send Notification: FR-024-027, BR-009, and the notification API (markAsRead).
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

let cat;
let otherCat;
const agents = {};
let applicationId;

/** Notifications of a user, newest first, as the API returns them. */
async function inbox(agent) {
  const res = await agent.get('/api/notifications');
  expect(res.status).toBe(200);
  return res.body;
}

async function latest(agent) {
  return (await inbox(agent)).notifications[0];
}

const decide = (agent, id, body) => agent.post(`/api/documents/${id}/decision`).send(body);

beforeAll(async () => {
  cat = await createTestCategory([
    ['marksheet', 'Class X Marksheet'],
    ['photo', 'Passport Photo'],
  ]);
  otherCat = await createTestCategory([['id', 'Identity Proof']]);
  await createUser('ver1', 'VERIFIER', { assignedCategoryId: cat.id });
  await createUser('ver2', 'VERIFIER', { assignedCategoryId: cat.id });
  await createUser('verother', 'VERIFIER', { assignedCategoryId: otherCat.id });
  await createUser('verinactive', 'VERIFIER', { assignedCategoryId: cat.id, isActive: false });
  await createUser('admin', 'ADMINISTRATOR');
  for (const name of ['ver1', 'ver2', 'verother', 'admin']) agents[name] = await loginAs(name);
  agents.applicant = await registerApplicant('applicant', cat.id);
  applicationId = (await agents.applicant.get('/api/applications/me')).body.application.id;
});

afterAll(async () => {
  await cleanupUsers();
  await deleteTestCategory(cat.code);
  await deleteTestCategory(otherCat.code);
  await pool.end();
});

describe('missing-document notifications (FR-025)', () => {
  it('welcomes a new applicant with the list of documents to upload', async () => {
    const { notifications, unread } = await inbox(agents.applicant);
    expect(notifications).toHaveLength(1);
    expect(unread).toBe(1);
    expect(notifications[0]).toMatchObject({ type: 'MISSING_DOCUMENT', status: 'SENT', isRead: false, link: '/applicant' });
    expect(notifications[0].message).toMatch(/Class X Marksheet and Passport Photo/);
  });

  it('lets staff of the category send a reminder listing what is still missing', async () => {
    const res = await agents.ver1.post(`/api/verification/applications/${applicationId}/remind`);
    expect(res.status).toBe(200);
    expect(res.body.reminder.missing).toBe(2);
    expect((await latest(agents.applicant)).message).toMatch(/^Reminder: .*these 2 documents/);

    expect((await agents.verother.post(`/api/verification/applications/${applicationId}/remind`)).status).toBe(404);
    expect((await agents.applicant.post(`/api/verification/applications/${applicationId}/remind`)).status).toBe(403);
  });

  it('tells applicants when a new mandatory document is added to their checklist', async () => {
    const res = await agents.admin
      .post(`/api/admin/categories/${cat.id}/checklist`)
      .send({ documentType: 'Income Certificate', isMandatory: true });
    expect(res.status).toBe(201);
    expect(await latest(agents.applicant)).toMatchObject({
      type: 'MISSING_DOCUMENT',
      message: expect.stringContaining('Income Certificate'),
      link: `/applicant/documents/${res.body.item.id}`,
    });
    // Remove it again so the rest of the tests work with two items.
    expect((await agents.admin.delete(`/api/admin/checklist-items/${res.body.item.id}`)).status).toBe(204);
  });
});

describe('new-submission notifications to staff (FR-027)', () => {
  let documentId;

  it('notifies every active verifier of the category, and nobody else', async () => {
    const res = await upload(agents.applicant, cat.items.marksheet, files.pdf('one'), { name: 'marks.pdf' });
    expect(res.status).toBe(201);
    documentId = res.body.result.documentId;

    for (const name of ['ver1', 'ver2']) {
      expect(await latest(agents[name])).toMatchObject({
        type: 'NEW_SUBMISSION',
        message: expect.stringMatching(/Applicant applicant \(ADM-\d{4}-\d+\) uploaded Class X Marksheet\./),
        link: `/cases/documents/${documentId}`,
      });
    }
    expect((await inbox(agents.verother)).notifications).toHaveLength(0);
    const { rows } = await pool.query(
      `SELECT count(*) FROM notifications n JOIN users u ON u.id = n.recipient_id WHERE u.email LIKE 'verinactive.%'`,
    );
    expect(Number(rows[0].count)).toBe(0);
  });

  it('says when a document was replaced', async () => {
    await upload(agents.applicant, cat.items.marksheet, files.pdf('two'), { confirmReplace: true });
    expect((await latest(agents.ver1)).message).toMatch(/replaced Class X Marksheet/);
  });

  describe('decision notifications to the applicant (FR-024, FR-026, BR-009)', () => {
    it('sends a remark on a pending document as REMARK_ADDED', async () => {
      await decide(agents.ver1, documentId, { status: 'PENDING', remarks: 'Is this the final marksheet?' });
      expect(await latest(agents.applicant)).toMatchObject({
        type: 'REMARK_ADDED',
        message: expect.stringContaining('Is this the final marksheet?'),
        link: `/applicant/documents/${cat.items.marksheet}`,
      });
    });

    it('asks for a corrected copy when a document is rejected', async () => {
      await decide(agents.ver1, documentId, { status: 'REJECTED', remarks: 'Page 2 is missing.' });
      expect(await latest(agents.applicant)).toMatchObject({
        type: 'STATUS_UPDATE',
        message: 'Your Class X Marksheet was rejected. Reason: Page 2 is missing. Please upload a corrected copy.',
      });
    });

    it('creates exactly one notification per status change, and none for a refused decision', async () => {
      const before = (await inbox(agents.applicant)).notifications.length;
      await upload(agents.applicant, cat.items.marksheet, files.pdf('three'));
      expect((await decide(agents.ver1, documentId, { status: 'VERIFIED' })).status).toBe(200);
      expect((await decide(agents.ver2, documentId, { status: 'VERIFIED' })).status).toBe(409);

      const { notifications } = await inbox(agents.applicant);
      expect(notifications.length).toBe(before + 1);
      expect(notifications[0]).toMatchObject({ type: 'STATUS_UPDATE', message: 'Your Class X Marksheet has been verified.' });
    });

    it('tells the applicant about an administrator correction', async () => {
      await agents.admin.post(`/api/documents/${documentId}/correction`).send({ status: 'PENDING', reason: 'Board result was re-issued.' });
      expect((await latest(agents.applicant)).message).toBe('Your Class X Marksheet will be reviewed again: "Board result was re-issued."');
    });
  });
});

describe('reading notifications (Notification.markRead)', () => {
  it('marks one notification as read and lowers the unread count', async () => {
    const { notifications, unread } = await inbox(agents.applicant);
    const res = await agents.applicant.patch(`/api/notifications/${notifications[0].id}/read`);
    expect(res.status).toBe(200);
    expect(res.body.notification).toMatchObject({ status: 'READ', isRead: true });
    expect((await agents.applicant.get('/api/notifications/unread-count')).body.unread).toBe(unread - 1);
  });

  it('does not let a user read or see someone else’s notifications', async () => {
    const theirs = (await inbox(agents.applicant)).notifications[1];
    expect((await agents.ver1.patch(`/api/notifications/${theirs.id}/read`)).status).toBe(404);
    const mine = (await inbox(agents.ver1)).notifications;
    expect(mine.every((n) => n.type === 'NEW_SUBMISSION')).toBe(true);
  });

  it('marks everything as read', async () => {
    expect((await agents.applicant.patch('/api/notifications/read-all')).status).toBe(200);
    const { notifications, unread } = await inbox(agents.applicant);
    expect(unread).toBe(0);
    expect(notifications.every((n) => n.isRead)).toBe(true);
  });
});

describe('reminders when nothing is missing', () => {
  it('refuses to send an empty reminder', async () => {
    const reg = await registerApplicant('complete', otherCat.id);
    const docId = (await upload(reg, otherCat.items.id, files.pdf('id'))).body.result.documentId;
    expect((await decide(agents.verother, docId, { status: 'VERIFIED' })).status).toBe(200);
    const appId = (await reg.get('/api/applications/me')).body.application.id;
    const res = await agents.verother.post(`/api/verification/applications/${appId}/remind`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NOTHING_MISSING');
  });
});
