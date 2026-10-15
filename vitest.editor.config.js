import { defineConfig } from 'vitest/config';
// Editor tests: the real editor page in headless Chrome against a RUNNING app (npm run dev). They create their own throwaway
// offers (invented text) and delete only those. Run with `npm run test:editor` (SNAPE_URL to point elsewhere, CHROME_PATH for Chrome).
export default defineConfig({ test: { include: ['tests/editor/**/*.test.js'], environment: 'node', testTimeout: 90000, hookTimeout: 60000, fileParallelism: false } });
