import { defineConfig } from 'vitest/config';
// Fast tests: calculations, migrations, diff, render structure. No browser. Run with `npm test`.
export default defineConfig({ test: { include: ['tests/unit/**/*.test.js'], environment: 'node' } });
