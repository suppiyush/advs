// API Gateway / Web Server component (§45).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { query } from './config/db.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './modules/auth/auth.routes.js';
import {
  adminCategoryRoutes,
  adminChecklistItemRoutes,
  publicCategoryRoutes,
} from './modules/categories/category.routes.js';
import applicationRoutes from './modules/documents/application.routes.js';
import documentRoutes from './modules/documents/document.routes.js';
import { decisionRoutes, verificationRoutes } from './modules/verification/verification.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import { adminSystemRoutes, adminUserRoutes } from './modules/admin/user.routes.js';
import reportRoutes from './modules/reports/report.routes.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

export function createApp() {
  const app = express();

  // Behind a hosting platform's proxy (Render, Railway): needed for secure cookies and per-IP limits.
  if (env.isProduction) app.set('trust proxy', 1);

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

  // For uptime checks: also reports whether the database answers.
  app.get('/api/health', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', publicCategoryRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/documents', decisionRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/verification', verificationRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin/users', adminUserRoutes);
  app.use('/api/admin/categories', adminCategoryRoutes);
  app.use('/api/admin/checklist-items', adminChecklistItemRoutes);
  app.use('/api/admin', adminSystemRoutes);
  app.use('/api/reports', reportRoutes);

  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same origin (deployment notes, plan §9).
  if (env.isProduction && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    // Client-side routes (/applicant, /cases/...) all load the single-page app.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
