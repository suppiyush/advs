import { z } from 'zod';

const id = (message = 'Invalid id.') => z.coerce.number({ error: message }).int(message).positive(message).max(2147483647, message);

const password = z
  .string({ error: 'Enter a password.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be at most 72 characters.')
  .regex(/[A-Za-z]/, 'Password must contain a letter.')
  .regex(/[0-9]/, 'Password must contain a digit.');

const phone = z
  .string()
  .trim()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number (10-15 digits).').nullable())
  .nullable()
  .optional();

const name = z.string({ error: 'Enter a name.' }).trim().min(2, 'Name must be at least 2 characters.').max(100);

export const idParamSchema = z.object({ id: id() });

export const userListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(['APPLICANT', 'VERIFIER', 'ADMINISTRATOR']).optional(),
});

// Administrators create staff accounts; applicants register themselves (FR-001).
export const createUserSchema = z
  .object({
    name,
    email: z.string({ error: 'Enter an email address.' }).trim().toLowerCase().pipe(z.email({ error: 'Enter a valid email address.' })),
    phone,
    role: z.enum(['VERIFIER', 'ADMINISTRATOR'], { error: 'Choose Verifier or Administrator.' }),
    assignedCategoryId: id('Choose a category.').nullable().optional(),
    password,
  })
  .superRefine((v, ctx) => {
    if (v.role === 'ADMINISTRATOR' && v.assignedCategoryId) {
      ctx.addIssue({ code: 'custom', path: ['assignedCategoryId'], message: 'Only verifiers are assigned a category.' });
    }
  });

export const updateUserSchema = z
  .object({
    name: name.optional(),
    phone,
    role: z.enum(['APPLICANT', 'VERIFIER', 'ADMINISTRATOR']).optional(),
    isActive: z.boolean().optional(),
    assignedCategoryId: id('Choose a category.').nullable().optional(),
    applicationCategoryId: id('Choose a category.').optional(),
    password: password.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const settingsSchema = z
  .object({
    registrationOpen: z.boolean().optional(),
    // multer buffers at most 20 MB (middleware/upload.js)
    maxUploadMb: z.coerce.number({ error: 'Enter a size in MB.' }).int('Use whole megabytes.').min(1, 'At least 1 MB.').max(20, 'At most 20 MB.').optional(),
    allowedMimeTypes: z
      .array(z.enum(['application/pdf', 'image/jpeg', 'image/png']))
      .min(1, 'Allow at least one file format.')
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update.');

export const auditQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  actorId: id().optional(),
  from: z.coerce.date({ error: 'Invalid start date.' }).optional(),
  to: z.coerce.date({ error: 'Invalid end date.' }).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
});
