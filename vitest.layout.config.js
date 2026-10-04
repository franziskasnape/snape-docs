import { defineConfig } from 'vitest/config';
// Layout tests: real Paged.js pagination in headless Chrome. Slower. Run with `npm run test:layout`.
export default defineConfig({ test: { include: ['tests/layout/**/*.test.js'], environment: 'node', testTimeout: 180000, hookTimeout: 60000, fileParallelism: false } });
