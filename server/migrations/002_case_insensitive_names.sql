-- "Class X Marksheet" and "class x marksheet" are the same document; likewise for category names.
-- Replace the case-sensitive unique constraints with case-insensitive unique indexes.

ALTER TABLE checklist_items DROP CONSTRAINT checklist_items_category_id_document_type_key;
CREATE UNIQUE INDEX checklist_items_category_document_type_ci
  ON checklist_items (category_id, lower(document_type));

ALTER TABLE categories DROP CONSTRAINT categories_name_key;
CREATE UNIQUE INDEX categories_name_ci ON categories (lower(name));
