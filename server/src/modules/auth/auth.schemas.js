import { z } from 'zod';

const email = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address.' }));

export const registerSchema = z.object({
  name: z
    .string({ error: 'Enter your full name.' })
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name must be at most 100 characters.'),
  email,
  phone: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, 'Enter a valid phone number (10-15 digits).').optional())
    .optional(),
  password: z
    .string({ error: 'Choose a password.' })
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a digit.'),
  categoryId: z.coerce
    .number({ error: 'Select your admission category.' })
    .int({ error: 'Select your admission category.' })
    .positive({ error: 'Select your admission category.' }),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Enter your password.' }).min(1, 'Enter your password.'),
});
