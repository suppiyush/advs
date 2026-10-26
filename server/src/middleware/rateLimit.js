// Brute-force protection for the public auth endpoints (NFR-004).
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

function tooMany(message) {
  return (req, res) => res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message } });
}

/** 10 failed logins per email and IP address in 15 minutes. Successful logins do not count. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
  handler: tooMany('Too many failed login attempts. Please wait 15 minutes and try again.'),
});

/** 30 registrations per IP address per hour. Off in tests, which register many applicants. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
  handler: tooMany('Too many registrations from this network. Please try again later.'),
});
