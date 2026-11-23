import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path('./src'),
      // `server-only` throws outside a React Server environment; tests import server modules directly.
      'server-only': path('./tests/stubs/empty.ts'),
      // Bindings come from a test-provided env (real local D1/R2 in integration tests) instead of a live Worker.
      '@opennextjs/cloudflare': path('./tests/stubs/cloudflare-context.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Integration files each start their own in-memory D1/R2; run files one at a time to keep CI memory flat.
    fileParallelism: false,
  },
});
