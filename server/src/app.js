// API Gateway / Web Server component (§45).
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import {
  adminCategoryRoutes,
  adminChecklistItemRoutes,
  publicCategoryRoutes,
} from './modules/categories/category.routes.js';
import applicationRoutes from './modules/documents/application.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import adminUserRoutes from './modules/admin/user.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));
  // API responses carry per-user data; never let the browser cache them.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', publicCategoryRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/admin/users', adminUserRoutes);
  app.use('/api/admin/categories', adminCategoryRoutes);
  app.use('/api/admin/checklist-items', adminChecklistItemRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
