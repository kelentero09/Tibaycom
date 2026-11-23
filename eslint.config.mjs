import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: ['.next/**', '.open-next/**', '.wrangler/**', 'node_modules/**', 'migrations/**', 'cloudflare-env.d.ts', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // Full page loads are intentional after sign-in, account deletion and checkout so every server component re-reads the session.
      '@next/next/no-location-assign-relative-destination': 'off',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': 'allow-with-description' }],
    },
  },
];

export default config;
