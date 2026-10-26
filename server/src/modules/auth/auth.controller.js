import { env } from '../../config/env.js';
import { AUTH_COOKIE } from '../../config/constants.js';
import { authenticate, issueToken, registerApplicant } from './auth.service.js';

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
};

function startSession(res, user) {
  res.cookie(AUTH_COOKIE, issueToken(user), { ...cookieOptions, maxAge: EIGHT_HOURS_MS });
}

export async function register(req, res) {
  const user = await registerApplicant(req.body);
  startSession(res, user);
  res.status(201).json({ user });
}

export async function login(req, res) {
  const user = await authenticate(req.body.email, req.body.password);
  startSession(res, user);
  res.json({ user });
}

export function logout(req, res) {
  res.clearCookie(AUTH_COOKIE, cookieOptions);
  res.status(204).end();
}

export function me(req, res) {
  res.json({ user: req.user });
}
