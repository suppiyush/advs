import { z } from 'zod';

const name = z
  .string({ error: 'Enter a category name.' })
  .trim()
  .min(2, 'Name must be at least 2 characters.')
  .max(60, 'Name must be at most 60 characters.');

const description = z
  .string()
  .trim()
  .max(200, 'Description must be at most 200 characters.')
  .transform((v) => v || null)
  .nullable()
  .optional();

export const createCategorySchema = z.object({
  code: z
    .string({ error: 'Enter a category code.' })
    .trim()
    .toUpperCase()
    .regex(/^CAT-[A-Z0-9]{2,10}$/, 'Code must look like CAT-GEN (CAT- followed by 2-10 letters or digits).'),
  name,
  description,
});

// The code is the category's identifier (e.g. CAT-GEN) and cannot change after creation.
export const updateCategorySchema = z
  .object({
    name: name.optional(),
    description,
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

const documentType = z
  .string({ error: 'Enter a document type.' })
  .trim()
  .min(2, 'Document type must be at least 2 characters.')
  .max(80, 'Document type must be at most 80 characters.');

export const createChecklistItemSchema = z.object({
  documentType,
  isMandatory: z.boolean().default(true),
});

export const updateChecklistItemSchema = z
  .object({
    documentType: documentType.optional(),
    isMandatory: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const idParamSchema = z.object({
  id: z.coerce.number({ error: 'Invalid id.' }).int().positive('Invalid id.').max(2147483647, 'Invalid id.'),
});
