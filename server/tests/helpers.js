// Shared test helpers. Every test file gets its own runId; users it creates have emails ending in
// .<runId>@advs.test and are deleted by cleanupUsers().
import fs from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { uploadRoot } from '../src/services/fileStore.js';

export const app = createApp();
export const PASSWORD = 'Test1234pass';
export const runId = `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
// Emails are stored lower-case (login lowercases what the user types).
export const emailFor = (name) => `${name}.${runId}@advs.test`.toLowerCase();

export async function createUser(name, role, { isActive = true, assignedCategoryId = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active, assigned_category_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [name, emailFor(name), await hashPassword(PASSWORD), role, isActive, assignedCategoryId],
  );
  return rows[0].id;
}

/** Creates a throwaway category with the given checklist; returns { id, code, items: { [key]: itemId } }. */
export async function createTestCategory(items) {
  const code = `CAT-T${(Date.now() + Math.floor(Math.random() * 1e6)).toString(36).toUpperCase()}`.slice(0, 14);
  const { rows } = await pool.query(`INSERT INTO categories (code, name) VALUES ($1, $2) RETURNING id`, [
    code,
    `Test ${code} ${runId}`,
  ]);
  const ids = {};
  for (const [key, documentType, isMandatory = true] of items) {
    const { rows: item } = await pool.query(
      `INSERT INTO checklist_items (category_id, document_type, is_mandatory) VALUES ($1, $2, $3) RETURNING id`,
      [rows[0].id, documentType, isMandatory],
    );
    ids[key] = item[0].id;
  }
  return { id: rows[0].id, code, items: ids };
}

export async function deleteTestCategory(code) {
  await pool.query('DELETE FROM categories WHERE code = $1', [code]);
}

/** Uploads a file for a checklist item as the given applicant agent. */
export function upload(agent, itemId, buffer, { name = 'scan.pdf', type = 'application/pdf', confirmReplace } = {}) {
  let req = agent.post('/api/applications/me/documents');
  if (itemId !== undefined) req = req.field('checklistItemId', String(itemId));
  if (confirmReplace !== undefined) req = req.field('confirmReplace', String(confirmReplace));
  if (buffer) req = req.attach('file', buffer, { filename: name, contentType: type });
  return req;
}

// Minimal valid files: real type is detected from these leading bytes.
export const files = {
  pdf: (text = 'test') => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF\n`),
  png: () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  jpg: () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]),
};

export async function loginAs(name) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email: emailFor(name), password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

/** Registers an applicant through the API and returns a logged-in agent. */
export async function registerApplicant(name, categoryId) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ name: `Applicant ${name}`, email: emailFor(name), password: PASSWORD, categoryId });
  expect(res.status).toBe(201);
  return agent;
}

export async function cleanupUsers() {
  // Remove stored files of this run's applications before their rows disappear.
  const { rows } = await pool.query(
    `SELECT a.id FROM applications a JOIN users u ON u.id = a.applicant_id WHERE u.email LIKE $1`,
    [`%.${runId}@advs.test`],
  );
  for (const { id } of rows) {
    await fs.rm(path.join(uploadRoot, String(id)), { recursive: true, force: true });
  }
  // Applicants first: that cascades to their documents and verification records, which otherwise
  // keep the verifiers who made those decisions from being deleted.
  await pool.query(`DELETE FROM users WHERE email LIKE $1 AND role = 'APPLICANT'`, [`%.${runId}@advs.test`]);
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%.${runId}@advs.test`]);
}
