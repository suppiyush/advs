import { z } from 'zod';

const positiveId = (message) => z.coerce.number({ error: message }).int(message).positive(message).max(2147483647, message);

// Multipart fields arrive as strings.
export const uploadSchema = z.object({
  checklistItemId: positiveId('Choose a document from your checklist.'),
  confirmReplace: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const documentIdSchema = z.object({ id: positiveId('Invalid document id.') });

export const fileQuerySchema = z.object({
  version: positiveId('Invalid version.').optional(),
});
