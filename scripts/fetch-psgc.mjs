// Regenerates src/data/ph-locations.json from the public PSGC API (Philippine Standard Geographic Code).
// Usage: node scripts/fetch-psgc.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'https://psgc.gitlab.io/api';
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const [provinces, places] = await Promise.all([get('/provinces/'), get('/cities-municipalities/')]);
const provinceByCode = new Map(provinces.map((p) => [p.code, p.name]));
const out = {};
const NCR_REGION = '130000000';
// Independent cities the PSGC lists without a province code; file them under the province they sit in.
const INDEPENDENT = { 'City of Isabela': 'Basilan', 'City of Cotabato': 'Maguindanao' };
const provinceNames = new Map(provinces.map((p) => [p.name.toLowerCase(), p.name]));
for (const place of places) {
  let province = place.provinceCode ? provinceByCode.get(place.provinceCode) : undefined;
  if (!province && place.regionCode === NCR_REGION) province = 'Metro Manila';
  if (!province && INDEPENDENT[place.name]) province = provinceNames.get(INDEPENDENT[place.name].toLowerCase());
  if (!province) {
    console.warn('Skipped (no province):', place.name, place.regionCode);
    continue;
  }
  (out[province] ??= []).push(place.name);
}
const sorted = Object.fromEntries(
  Object.keys(out)
    .sort((a, b) => a.localeCompare(b))
    .map((p) => [p, [...new Set(out[p])].sort((a, b) => a.localeCompare(b))]),
);
writeFileSync(new URL('../src/data/ph-locations.json', import.meta.url), JSON.stringify(sorted));
console.log(Object.keys(sorted).length, 'provinces,', Object.values(sorted).flat().length, 'cities/municipalities');
