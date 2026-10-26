// Shared test helpers. Every test file gets its own runId; users it creates have emails ending in
// .<runId>@advs.test and are deleted by cleanupUsers().
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

export const app = createApp();
export const PASSWORD = 'Test1234pass';
export const runId = `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
export const emailFor = (name) => `${name}.${runId}@advs.test`;

export async function createUser(name, role, { isActive = true } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, emailFor(name), await hashPassword(PASSWORD), role, isActive],
  );
  return rows[0].id;
}

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
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`%.${runId}@advs.test`]);
}
