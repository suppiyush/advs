// Demo data for presentations: the seeded applicants with documents in different states.
// Uses the real services, so notifications and audit entries are created as in normal use.
// Safe to re-run: it first removes the documents and notifications of the seeded demo users.
// Run `npm run seed` first.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { uploadRoot } from '../src/services/fileStore.js';
import { recomputeApplicationStatus, uploadDocument } from '../src/modules/documents/document.service.js';
import { recordDecision } from '../src/modules/verification/verification.service.js';
import { makePdf, makePhotoPng } from './lib/demoFiles.js';

const APPLICANTS = ['rahul.mehta@advs.local', 'priya.sharma@advs.local', 'arjun.verma@advs.local'];
const VERIFIERS = ['verifier.gen@advs.local', 'verifier.obc@advs.local'];

// What each applicant uploads and what the verifier then decides.
// decision: VERIFIED | REJECTED | PENDING (kept pending with a remark) | undefined (not reviewed yet)
const PLAN = {
  'rahul.mehta@advs.local': {
    verifier: 'verifier.gen@advs.local',
    documents: [
      { type: 'Class X Marksheet', decision: 'VERIFIED' },
      { type: 'Class XII Marksheet', decision: 'VERIFIED' },
      { type: 'Identity Proof', decision: 'VERIFIED' },
      { type: 'Entrance Scorecard', decision: 'PENDING', remarks: 'Please confirm this is the final scorecard, not the provisional one.' },
      { type: 'Passport Photo' },
    ],
  },
  'priya.sharma@advs.local': {
    verifier: 'verifier.obc@advs.local',
    documents: [
      { type: 'Class X Marksheet', decision: 'VERIFIED' },
      { type: 'Class XII Marksheet', decision: 'VERIFIED' },
      { type: 'Category Certificate', decision: 'REJECTED', remarks: 'The certificate has expired. Please upload one issued in the last 12 months.' },
      { type: 'Passport Photo' },
    ],
  },
  'arjun.verma@advs.local': { documents: [] },
};

async function userByEmail(email) {
  const { rows } = await pool.query('SELECT id, name, role, assigned_category_id FROM users WHERE email = $1', [email]);
  if (!rows[0]) throw new Error(`${email} not found. Run \`npm run seed\` first.`);
  return rows[0];
}

async function reset() {
  const { rows: apps } = await pool.query(
    `SELECT a.id FROM applications a JOIN users u ON u.id = a.applicant_id WHERE u.email = ANY($1)`,
    [APPLICANTS],
  );
  for (const { id } of apps) {
    await pool.query('DELETE FROM documents WHERE application_id = $1', [id]);
    await fs.rm(path.join(uploadRoot, String(id)), { recursive: true, force: true });
    await recomputeApplicationStatus({ applicationId: id });
  }
  await pool.query(
    `DELETE FROM notifications n USING users u WHERE u.id = n.recipient_id AND u.email = ANY($1)`,
    [[...APPLICANTS, ...VERIFIERS]],
  );
}

function fileFor(applicantName, documentType) {
  if (documentType === 'Passport Photo') {
    return { buffer: makePhotoPng(), originalname: 'passport-photo.png' };
  }
  const lines = {
    'Class X Marksheet': ['Board of Secondary Education', 'Total marks: 472 / 500'],
    'Class XII Marksheet': ['Board of Higher Secondary Education', 'Total marks: 451 / 500'],
    'Entrance Scorecard': ['Joint Entrance Examination', 'Percentile: 96.4 (provisional)'],
    'Identity Proof': ['Aadhaar (demo copy)', 'XXXX XXXX 1234'],
    'Category Certificate': ['OBC-NCL Certificate', 'Issued: 03/2025'],
    'Income Certificate': ['Family income certificate', 'Annual income: 6,40,000'],
  }[documentType] ?? [];
  return {
    buffer: makePdf(`${documentType} - ${applicantName}`, lines),
    originalname: `${documentType.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
  };
}

async function seedDemo() {
  if (env.isProduction) throw new Error('Refusing to create demo data with NODE_ENV=production.');
  await reset();

  for (const [email, plan] of Object.entries(PLAN)) {
    const applicant = await userByEmail(email);
    const verifier = plan.verifier && (await userByEmail(plan.verifier));
    const { rows: items } = await pool.query(
      `SELECT ci.id, ci.document_type FROM checklist_items ci
         JOIN applications a ON a.category_id = ci.category_id WHERE a.applicant_id = $1`,
      [applicant.id],
    );
    const itemId = Object.fromEntries(items.map((i) => [i.document_type, i.id]));

    for (const doc of plan.documents) {
      const file = fileFor(applicant.name, doc.type);
      const { documentId } = await uploadDocument(
        applicant.id,
        { checklistItemId: itemId[doc.type] },
        { ...file, size: file.buffer.length },
      );
      if (doc.decision) {
        await recordDecision(
          { id: verifier.id, role: verifier.role, assignedCategoryId: verifier.assigned_category_id },
          documentId,
          { status: doc.decision, remarks: doc.remarks },
        );
      }
    }
    console.log(`  ${applicant.name}: ${plan.documents.length} document(s)`);
  }

  const { rows } = await pool.query(
    `SELECT u.name, a.application_number, a.overall_status FROM applications a JOIN users u ON u.id = a.applicant_id
      WHERE u.email = ANY($1) ORDER BY a.application_number`,
    [APPLICANTS],
  );
  console.log('Demo data ready:');
  for (const r of rows) console.log(`  ${r.application_number}  ${r.name.padEnd(14)} ${r.overall_status}`);
}

seedDemo()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
