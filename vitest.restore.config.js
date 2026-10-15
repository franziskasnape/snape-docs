import { defineConfig } from 'vitest/config';
// Restore tests: run scripts/restore.mjs (and wrangler) on a synthetic old snapshot in a temporary folder. Slower (~30 s).
// Run with `npm run test:restore`. Never touches your real data (--state points into a temp folder).
export default defineConfig({ test: { include: ['tests/restore/**/*.test.js'], environment: 'node', testTimeout: 180000, fileParallelism: false } });
