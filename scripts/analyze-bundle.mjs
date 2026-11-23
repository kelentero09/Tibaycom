// Shows what makes up the Worker bundle. Run after `pnpm build:worker`:  node scripts/analyze-bundle.mjs
import { existsSync, readFileSync } from 'node:fs';

const metaPath = '.open-next/server-functions/default/handler.mjs.meta.json';
if (!existsSync(metaPath)) {
  console.error('Build the worker first: pnpm build:worker');
  process.exit(1);
}
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
const output = Object.values(meta.outputs)[0];
const groups = {};
for (const [rawKey, value] of Object.entries(output.inputs)) {
  let key = rawKey.split('\\').join('/');
  const marker = key.lastIndexOf('node_modules/');
  if (marker >= 0) {
    const parts = key.slice(marker + 'node_modules/'.length).split('/');
    key = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    if (key === 'next') key = `next/${parts.slice(1, 4).join('/')}`;
  } else {
    key = key.split('/').slice(0, 6).join('/');
  }
  groups[key] = (groups[key] ?? 0) + value.bytesInOutput;
}
const total = Object.values(groups).reduce((a, b) => a + b, 0);
console.log(`Total (uncompressed): ${(total / 1024 / 1024).toFixed(1)} MiB\n`);
for (const [key, bytes] of Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, Number(process.argv[2] ?? 30))) {
  console.log(`${(bytes / 1024).toFixed(0).padStart(7)} KiB  ${key}`);
}
