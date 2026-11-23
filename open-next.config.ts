import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Every route is rendered on demand (see `dynamic` in src/app/layout.tsx), so no ISR cache / R2 / KV is configured.
export default defineCloudflareConfig({});
