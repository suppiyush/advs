import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    // Generous limits: every query is a round trip to a remote Neon database.
    testTimeout: 30000,
    hookTimeout: 120000,
    // Tests share one database; run files one after another.
    fileParallelism: false,
  },
});
