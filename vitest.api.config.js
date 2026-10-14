import { defineConfig } from 'vitest/config';
// API tests: talk to a RUNNING app (npm run dev) over HTTP. They create their own throwaway offers and delete only those.
// Run with `npm run test:api` (SNAPE_URL to point elsewhere).
export default defineConfig({ test: { include: ['tests/api/**/*.test.js'], environment: 'node', testTimeout: 60000, fileParallelism: false } });
