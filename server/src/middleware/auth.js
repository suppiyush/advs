// Authentication & Access Control component (§45): NFR-004, NFR-005, FR-006.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AUTH_COOKIE } from '../config/constants.js';
import { findActiveUserById } from '../modules/auth/auth.service.js';
import { AppError } from './errorHandler.js';

/** Requires a valid session cookie; loads the current user into req.user. */
export async function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again.');
  }

  // Re-read the user so deactivation and role changes take effect immediately.
  const user = await findActiveUserById(payload.sub);
  if (!user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session is no longer valid. Please log in again.');
  }
  req.user = user;
  next();
}

/** Restricts a route to the given roles. Use after requireAuth. */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
    next();
  };
}
