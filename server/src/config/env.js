import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See server/.env.example.`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  // API_PORT, not PORT: dev tooling sets PORT for the Vite server. Hosting platforms set PORT in production.
  port: Number(process.env.API_PORT || (nodeEnv === 'production' ? process.env.PORT : undefined)) || 5000,
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
};
