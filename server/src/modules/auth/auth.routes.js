import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { loginLimiter, registerLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { login, logout, me, register } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.schemas.js';

const router = Router();

router.post('/register', registerLimiter, validate(registerSchema), register);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
