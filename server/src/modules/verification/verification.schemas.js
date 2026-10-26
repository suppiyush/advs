import { z } from 'zod';

const remarks = z
  .string()
  .trim()
  .max(500, 'Remarks must be at most 500 characters.')
  .transform((v) => v || undefined)
  .optional();

// BR-003: Verified / Rejected / Pending. BR-004: a rejection needs a remark; so does keeping a
// document pending, since that is how the verifier asks the applicant for something.
export const decisionSchema = z
  .object({
    status: z.enum(['VERIFIED', 'REJECTED', 'PENDING'], { error: 'Choose Verify, Reject or Keep pending.' }),
    remarks,
    version: z.coerce.number().int().positive().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'VERIFIED' && !v.remarks) {
      ctx.addIssue({
        code: 'custom',
        path: ['remarks'],
        message:
          v.status === 'REJECTED'
            ? 'Enter the reason for rejecting this document.'
            : 'Enter a remark telling the applicant what is needed.',
      });
    }
  });

export const correctionSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED', 'PENDING'], { error: 'Choose the corrected status.' }),
  reason: z
    .string({ error: 'Enter the reason for this correction.' })
    .trim()
    .min(5, 'Enter the reason for this correction (at least 5 characters).')
    .max(500, 'The reason must be at most 500 characters.'),
});

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().max(2147483647).optional(),
});

export const idParamSchema = z.object({
  id: z.coerce.number({ error: 'Invalid id.' }).int('Invalid id.').positive('Invalid id.').max(2147483647, 'Invalid id.'),
});
