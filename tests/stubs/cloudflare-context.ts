/** Test replacement for `@opennextjs/cloudflare`: returns whatever env the test harness installed. */
type TestGlobal = typeof globalThis & { __TIBAY_TEST_ENV__?: CloudflareEnv };

export function setTestEnv(env: CloudflareEnv) {
  (globalThis as TestGlobal).__TIBAY_TEST_ENV__ = env;
}

export function getCloudflareContext() {
  const env = (globalThis as TestGlobal).__TIBAY_TEST_ENV__;
  if (!env) throw new Error('No test env installed. Call setupTestPlatform() first.');
  return { env, cf: undefined, ctx: { waitUntil() {}, passThroughOnException() {} } };
}
