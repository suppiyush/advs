// Category and checklist management (FR-007-010, FR-033, BR-008). Only administrators reach the
// mutating functions; every change is audit-logged (FR-035).
import { query, withTransaction } from '../../config/db.js';
import { AppError } from '../../middleware/errorHandler.js';
import { recordAudit } from '../../services/audit.js';
import { recomputeApplicationStatus } from '../documents/document.service.js';

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

function toCategory(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: row.created_at,
    ...(row.item_count !== undefined && {
      itemCount: Number(row.item_count),
      mandatoryCount: Number(row.mandatory_count),
      applicationCount: Number(row.application_count),
    }),
  };
}

function toChecklistItem(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    documentType: row.document_type,
    isMandatory: row.is_mandatory,
    documentCount: row.document_count !== undefined ? Number(row.document_count) : undefined,
  };
}

function duplicateError(err, field, message) {
  if (err.code === UNIQUE_VIOLATION) return new AppError(409, 'DUPLICATE', message, { [field]: message });
  return err;
}

export async function listActiveCategories() {
  const { rows } = await query('SELECT id, code, name, description, is_active, created_at FROM categories WHERE is_active ORDER BY name');
  return rows.map(toCategory);
}

export async function listAllCategories() {
  const { rows } = await query(
    `SELECT c.*,
            (SELECT count(*) FROM checklist_items ci WHERE ci.category_id = c.id) AS item_count,
            (SELECT count(*) FROM checklist_items ci WHERE ci.category_id = c.id AND ci.is_mandatory) AS mandatory_count,
            (SELECT count(*) FROM applications a WHERE a.category_id = c.id) AS application_count
       FROM categories c
      ORDER BY c.is_active DESC, c.name`,
  );
  return rows.map(toCategory);
}

async function findCategory(id, db = { query }) {
  const { rows } = await db.query('SELECT * FROM categories WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Category not found.');
  return rows[0];
}

/** Category.getChecklistItems(): the category with its checklist (FR-010). */
export async function getCategoryWithChecklist(id) {
  const category = toCategory(await findCategory(id));
  const { rows } = await query(
    `SELECT ci.*, (SELECT count(*) FROM documents d WHERE d.checklist_item_id = ci.id) AS document_count
       FROM checklist_items ci
      WHERE ci.category_id = $1
      ORDER BY ci.is_mandatory DESC, ci.id`,
    [id],
  );
  return { ...category, checklist: rows.map(toChecklistItem) };
}

export async function createCategory({ code, name, description }, actorId) {
  return withTransaction(async (client) => {
    let row;
    try {
      ({ rows: [row] } = await client.query(
        'INSERT INTO categories (code, name, description) VALUES ($1, $2, $3) RETURNING *',
        [code, name, description ?? null],
      ));
    } catch (err) {
      throw duplicateError(err, err.constraint?.includes('code') ? 'code' : 'name', 'A category with this code or name already exists.');
    }
    await recordAudit({ actorId, action: 'CATEGORY_CREATED', entityType: 'category', entityId: row.id, details: { code, name } }, client);
    return toCategory(row);
  });
}

export async function updateCategory(id, changes, actorId) {
  return withTransaction(async (client) => {
    const before = await findCategory(id, client);
    let row;
    try {
      ({ rows: [row] } = await client.query(
        `UPDATE categories
            SET name = COALESCE($2, name),
                description = CASE WHEN $3::boolean THEN $4 ELSE description END,
                is_active = COALESCE($5, is_active)
          WHERE id = $1
          RETURNING *`,
        [id, changes.name ?? null, 'description' in changes, changes.description ?? null, changes.isActive ?? null],
      ));
    } catch (err) {
      throw duplicateError(err, 'name', 'A category with this name already exists.');
    }
    await recordAudit(
      {
        actorId,
        action: 'CATEGORY_UPDATED',
        entityType: 'category',
        entityId: id,
        details: { before: { name: before.name, description: before.description, isActive: before.is_active }, changes },
      },
      client,
    );
    return toCategory(row);
  });
}

/** Category.addChecklistItem() (FR-008). */
export async function addChecklistItem(categoryId, { documentType, isMandatory }, actorId) {
  return withTransaction(async (client) => {
    await findCategory(categoryId, client);
    let row;
    try {
      ({ rows: [row] } = await client.query(
        `INSERT INTO checklist_items (category_id, document_type, is_mandatory) VALUES ($1, $2, $3) RETURNING *`,
        [categoryId, documentType, isMandatory],
      ));
    } catch (err) {
      throw duplicateError(err, 'documentType', 'This category already has that document type.');
    }
    // A new mandatory item can make complete applications incomplete again.
    await recomputeApplicationStatus({ categoryId }, client);
    await recordAudit(
      { actorId, action: 'CHECKLIST_ITEM_ADDED', entityType: 'checklist_item', entityId: row.id, details: { categoryId, documentType, isMandatory } },
      client,
    );
    return toChecklistItem(row);
  });
}

async function findChecklistItem(id, db) {
  const { rows } = await db.query('SELECT * FROM checklist_items WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError(404, 'NOT_FOUND', 'Checklist item not found.');
  return rows[0];
}

/** FR-009: rename an item or change its mandatory flag. */
export async function updateChecklistItem(id, changes, actorId) {
  return withTransaction(async (client) => {
    const before = await findChecklistItem(id, client);
    let row;
    try {
      ({ rows: [row] } = await client.query(
        `UPDATE checklist_items
            SET document_type = COALESCE($2, document_type),
                is_mandatory = COALESCE($3, is_mandatory)
          WHERE id = $1
          RETURNING *`,
        [id, changes.documentType ?? null, changes.isMandatory ?? null],
      ));
    } catch (err) {
      throw duplicateError(err, 'documentType', 'This category already has that document type.');
    }
    if (row.is_mandatory !== before.is_mandatory) {
      await recomputeApplicationStatus({ categoryId: row.category_id }, client);
    }
    await recordAudit(
      {
        actorId,
        action: 'CHECKLIST_ITEM_UPDATED',
        entityType: 'checklist_item',
        entityId: id,
        details: { categoryId: row.category_id, before: { documentType: before.document_type, isMandatory: before.is_mandatory }, changes },
      },
      client,
    );
    return toChecklistItem(row);
  });
}

/** Category.removeChecklistItem(). Items that applicants have already uploaded against are kept. */
export async function removeChecklistItem(id, actorId) {
  return withTransaction(async (client) => {
    const item = await findChecklistItem(id, client);
    try {
      await client.query('DELETE FROM checklist_items WHERE id = $1', [id]);
    } catch (err) {
      if (err.code === FOREIGN_KEY_VIOLATION) {
        throw new AppError(
          409,
          'ITEM_IN_USE',
          'Applicants have already uploaded documents for this item, so it cannot be removed. Mark it optional instead.',
        );
      }
      throw err;
    }
    await recomputeApplicationStatus({ categoryId: item.category_id }, client);
    await recordAudit(
      {
        actorId,
        action: 'CHECKLIST_ITEM_REMOVED',
        entityType: 'checklist_item',
        entityId: id,
        details: { categoryId: item.category_id, documentType: item.document_type },
      },
      client,
    );
  });
}
