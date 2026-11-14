import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws outside a React Server Component bundle; tests import server modules directly.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts', 'tests/components/**/*.test.tsx'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    environment: 'node',
    pool: 'forks',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
