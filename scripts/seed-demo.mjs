// DEVELOPMENT-ONLY demo content for the LOCAL database and image bucket used by `pnpm dev`.
//
//   pnpm db:seed:demo            add (or refresh) demo members, photos, projects, posts, reviews and requests
//   pnpm db:seed:demo --remove   remove everything this script added
//
// Unlike `pnpm db:seed` it never deletes your own data: every row it creates has an id starting with `demo_`
// and every image key contains `/de0de0de-`, so a re-run (or --remove) only touches what it added.
// Existing profiles only get a photo/cover where they have none, and projects only where they have none.
// Photos are freely licensed images from Wikimedia Commons, downloaded once into .wrangler/demo-images/.
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';

if (process.argv.includes('--remote') || process.env.APP_ENV === 'production') {
  console.error('Refusing to run: this script is for local development only.');
  process.exit(1);
}

const REMOVE = process.argv.includes('--remove');
const DEV_PASSWORD = 'tibay-dev-password';
const DAY = 86_400_000;
const now = Date.now();
const IMAGE_DIR = new URL('../.wrangler/demo-images/', import.meta.url);
const KEY_MARK = 'de0de0de';

/* ------------------------------------------------------------------ */
/* Deterministic randomness so re-runs produce the same demo           */
/* ------------------------------------------------------------------ */
let seed = 20261124;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const shuffle = (list) => [...list].sort(() => rand() - 0.5);
let counter = 0;
const demoId = (prefix) => `demo_${prefix}_${(++counter).toString(36).padStart(4, '0')}`;
const day = (msAgo) => new Date(now - msAgo).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */
const IMAGE_SETS = {
  house: ['modern house Philippines', 'bungalow house Philippines', 'two storey house residential', 'modern residential house exterior'],
  construction: ['house under construction Philippines', 'concrete hollow blocks construction', 'reinforced concrete construction site', 'building construction scaffolding'],
  interior: ['modern living room interior', 'modern kitchen interior', 'bedroom interior design'],
  bathroom: ['modern bathroom interior', 'bathroom wall tiles'],
  roof: ['metal roofing house', 'roof truss construction', 'roofing installation'],
  steel: ['steel gate design', 'welding steel fabrication', 'steel truss structure'],
  electrical: ['electrical panel board', 'electrical wiring installation', 'electrician working'],
  plumbing: ['plumbing pipes installation', 'water pipes plumbing'],
  paint: ['painted house facade colorful', 'painting wall roller', 'house exterior painting'],
  landscape: ['landscaped garden', 'garden landscape design tropical', 'garden pathway stones'],
  solar: ['rooftop solar panels house', 'solar panel installation roof'],
  glass: ['glass facade building', 'aluminum window frames', 'glass curtain wall'],
  aircon: ['split air conditioner indoor unit', 'air conditioner outdoor units wall'],
  masonry: ['brick wall masonry', 'stone wall masonry', 'plastering wall'],
  carpentry: ['wooden kitchen cabinets', 'woodworking carpentry workshop', 'wooden staircase'],
  tiles: ['ceramic floor tiles', 'tile installation floor', 'mosaic tiles'],
  cover: ['Makati skyline', 'Cebu City skyline', 'Davao City skyline', 'construction crane skyline', 'Bonifacio Global City'],
  logo: ['hard hat helmet', 'claw hammer', 'toolbox tools', 'tape measure', 'spirit level tool', 'masonry trowel', 'paint brushes', 'adjustable wrench', 'cordless drill', 'excavator', 'architectural blueprint', 'pipe wrench', 'welding helmet', 'hand saw', 'paint roller', 'pliers tool'],
};
const PER_QUERY = { logo: 1, cover: 2 };
const BAD_TITLE = /map|logo|diagram|flag|coat of arms|seal|chart|plan of|svg|icon|poster|stamp|painting by|portrait/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wikimedia rate-limits bursts: back off (honouring Retry-After) and try again. */
async function fetchJson(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'TibayDevSeed/1.0 (local development demo data)' } });
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 5000 * (attempt + 1);
      await sleep(Math.min(wait, 60_000));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await sleep(1000);
    return res.json();
  }
  throw new Error('still rate-limited');
}

async function download(url, file) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'TibayDevSeed/1.0 (local development demo data)' } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) return false;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false; // JPEG only
    writeFileSync(file, bytes);
    return true;
  }
  return false;
}

/** Downloads each image set once; later runs reuse the files. */
async function ensureImages() {
  mkdirSync(IMAGE_DIR, { recursive: true });
  for (const [set, queries] of Object.entries(IMAGE_SETS)) {
    const dir = new URL(`${set}/`, IMAGE_DIR);
    if (existsSync(dir) && readdirSync(dir).length) continue;
    mkdirSync(dir, { recursive: true });
    const width = set === 'logo' ? 400 : set === 'cover' ? 1280 : 960;
    const seen = new Set();
    let n = 0;
    for (const query of queries) {
      const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=${width}&format=json`;
      let pages = [];
      try {
        pages = Object.values((await fetchJson(api)).query?.pages ?? {}).sort((a, b) => a.index - b.index);
      } catch (err) {
        console.warn(`  search failed for "${query}": ${err.message}`);
      }
      let taken = 0;
      for (const page of pages) {
        const info = page.imageinfo?.[0];
        if (!info || info.mime !== 'image/jpeg' || BAD_TITLE.test(page.title) || seen.has(page.title)) continue;
        if (info.width < (set === 'logo' ? 300 : 900) || (set !== 'logo' && info.width < info.height)) continue; // landscape photos for projects/covers
        seen.add(page.title);
        if (await download(info.thumburl, new URL(`${n}.jpg`, dir))) {
          n++;
          taken++;
        }
        await new Promise((r) => setTimeout(r, 600));
        if (taken >= (PER_QUERY[set] ?? 3)) break;
      }
    }
    console.log(`  ${set}: ${n} images`);
  }
}

const imageCache = new Map();
function imageFiles(set) {
  if (!imageCache.has(set)) {
    const dir = new URL(`${set}/`, IMAGE_DIR);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort() : [];
    imageCache.set(set, files.map((f) => readFileSync(new URL(f, dir))));
  }
  return imageCache.get(set);
}
const cursor = new Map();
/** Next image of a set (round-robin, so neighbours rarely share a photo). Falls back to construction photos. */
function nextImage(set) {
  const files = imageFiles(set).length ? imageFiles(set) : imageFiles('construction');
  if (!files.length) return null;
  const i = cursor.get(set) ?? between(0, files.length - 1);
  cursor.set(set, i + 1);
  return files[i % files.length];
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */
const statements = [];
const insert = (table, row, verb = 'INSERT') => statements.push([`${verb} INTO ${table} (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`, Object.values(row).map((v) => (typeof v === 'boolean' ? Number(v) : v ?? null))]);
const run = (sql, ...params) => statements.push([sql, params]);
const uploads = [];
/** Queues an R2 upload and returns the key. */
function image(kind, userId, set) {
  const bytes = nextImage(set);
  if (!bytes) return null;
  const key = `${kind}/${userId}/${KEY_MARK}${randomUUID().slice(8)}.jpg`;
  uploads.push([key, bytes]);
  return { key, size: bytes.length };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = scryptSync(password.normalize('NFKC'), salt, 64, { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 });
  return `${salt}:${key.toString('hex')}`;
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
const TRADE_SET = {
  'general-contractor': ['house', 'construction'], architect: ['house', 'interior'], 'civil-engineer': ['construction', 'house'], 'electrical-engineer': ['solar', 'electrical'],
  'mechanical-engineer': ['aircon', 'construction'], 'sanitary-engineer': ['plumbing'], 'interior-designer': ['interior', 'bathroom'], foreman: ['construction', 'house'], mason: ['masonry', 'construction'],
  carpenter: ['carpentry', 'interior'], electrician: ['electrical', 'solar'], plumber: ['plumbing', 'bathroom'], painter: ['paint', 'house'], welder: ['steel'], 'tile-setter': ['tiles', 'bathroom'],
  roofer: ['roof', 'house'], 'glass-aluminum': ['glass'], 'hvac-technician': ['aircon'], landscaper: ['landscape'], 'heavy-equipment': ['construction'], supplier: ['construction'],
};

const PROJECTS = {
  house: [
    ['Two-storey family home', 'Design-and-build of a 160 sqm four-bedroom home with a roof deck and two-car garage.'],
    ['Modern bungalow', 'Three-bedroom bungalow on a 200 sqm lot with an open-plan living and dining area.'],
    ['Townhouse row (4 units)', 'Four 2-storey townhouse units with individual parking, built for a local developer.'],
  ],
  construction: [
    ['Three-storey mixed-use building', 'Ground-floor commercial space with two residential floors. Reinforced concrete frame.'],
    ['Warehouse extension', '600 sqm steel-and-concrete warehouse extension with loading bay.'],
    ['Second-floor addition', 'Added a full second floor with two bedrooms and a bath on an existing bungalow.'],
  ],
  interior: [
    ['Condo interior fit-out', 'Full interior of a 48 sqm condo: built-in cabinets, lighting and kitchen.'],
    ['Café interior', 'Warm wood-and-concrete café interior for 40 seats, finished in six weeks.'],
    ['Living and dining makeover', 'New ceiling, lighting, flooring and built-ins for a family living area.'],
  ],
  bathroom: [['Master bathroom renovation', 'Walk-in shower, large-format tiles and new fixtures.'], ['Two-bathroom upgrade', 'Waterproofing, retiling and new plumbing fixtures for two bathrooms.']],
  roof: [['Roof replacement', 'Replaced old GI sheets with pre-painted long-span metal roofing and new gutters.'], ['Steel roof framing', 'Light-gauge steel trusses and insulated roofing for a two-storey home.']],
  steel: [['Steel gate and fence', 'Sliding steel gate with matching perimeter fence, powder-coated.'], ['Steel staircase', 'Spiral steel staircase with wooden treads for a roof deck.'], ['Steel trusses for warehouse', 'Fabrication and installation of 18 m span steel trusses.']],
  electrical: [['House rewiring', 'Complete rewiring of a 30-year-old house, new panel board and dedicated aircon lines.'], ['Commercial electrical fit-out', 'Lighting, outlets and 3-phase panel for a retail space.']],
  plumbing: [['Water line replacement', 'Replaced corroded GI pipes with PPR lines and installed a pressure pump.'], ['Septic and drainage works', 'New 3-chamber septic tank and drainage for a new house.']],
  paint: [['Exterior repaint', 'Pressure washing, crack repair, waterproofing and two coats of elastomeric paint.'], ['Interior painting (whole house)', 'Skim coat and paint for a 2-storey, 4-bedroom home.']],
  landscape: [['Tropical front garden', 'Planting, pathway stones and garden lighting for a residential front yard.'], ['Resort garden', 'Landscaping around a pool and cabanas for a small resort.']],
  solar: [['6 kW rooftop solar', 'Grid-tied rooftop system with net metering application.'], ['Off-grid solar for farm', 'Solar with battery storage for a farmhouse and water pump.']],
  glass: [['Glass storefront', 'Tempered glass storefront and automatic door for a pharmacy.'], ['Aluminum windows (whole house)', 'Powder-coated aluminum sliding windows and doors for a new home.']],
  aircon: [['Split-type installation (6 units)', 'Supply and installation of inverter split-type aircons for a family home.'], ['Office aircon upgrade', 'Replaced window units with ceiling-mounted units for a 120 sqm office.']],
  masonry: [['Perimeter wall', 'CHB perimeter wall with plaster finish and pillars, 85 linear metres.'], ['Stone feature wall', 'Natural stone cladding for a living-room feature wall and gate posts.']],
  carpentry: [['Kitchen cabinets', 'Custom kitchen cabinets with quartz countertop and soft-close hardware.'], ['Wooden staircase and railings', 'Narra staircase treads and railings for a two-storey home.']],
  tiles: [['Floor tiling (whole house)', '60x60 porcelain floor tiles for a 120 sqm home, fully leveled.'], ['Pool and deck tiles', 'Pool mosaic tiles and anti-slip deck tiles.']],
};

const UPDATES = [
  ['Site clearing and layout', 'Lot cleared and staked. Batter boards set and layout checked with the owner.'],
  ['Footings poured', 'Excavation done and footings poured. Curing for 7 days before columns.'],
  ['Columns and beams', 'Ground-floor columns and beams finished. Formworks removed after curing.'],
  ['Walls up', 'CHB walls completed on the ground floor. Plumbing and electrical conduits embedded.'],
  ['Roofing installed', 'Trusses and roofing sheets installed — the house is now weather-tight.'],
  ['Finishing works started', 'Plastering, ceiling framing and tiling in progress.'],
];

const REVIEW_TEXT = {
  5: [
    'Very professional from start to finish. The team arrived on time every day and cleaned up after work. Our house was turned over two weeks early.',
    'Highly recommended! Clear quotation, no hidden charges, and they explained every stage of the build.',
    'Sulit ang bayad. Maayos ang gawa at mabilis kausap. We will hire them again for our second floor.',
    'Excellent workmanship. They suggested materials that cost less but still look great — we saved around ₱40,000.',
    'Honest and reliable. They sent photo updates every week while we were working abroad.',
    'Ang linis ng finishing! Walang sablay. Salamat sa buong team.',
    'They fixed a problem another contractor left behind, quickly and at a fair price. Very satisfied.',
  ],
  4: [
    'Good quality work. A few days of delay because of the rain, but they kept us informed the whole time.',
    'Maayos ang finishing. Minor touch-ups were needed after turnover but they came back the next day to fix them.',
    'Fair price and friendly crew. Replies could be a bit faster, but overall we are happy with the result.',
    'Solid work and good advice on materials. Would hire again.',
  ],
  3: ['The result is okay but the project took a month longer than promised. Workmanship is decent.', 'Quality is good but we had to follow up a lot on the schedule.'],
};
const OWNER_REPLIES = [
  'Salamat po sa tiwala! It was a pleasure working on your home.',
  'Thank you for the kind words. See you on the next project!',
  'Thank you for the honest feedback. We now assign an extra crew during the rainy season so this will not happen again.',
  'Maraming salamat po! Enjoy your new home.',
];

const POSTS = {
  update: [
    'Day 45 on site: second-floor slab poured this morning. Salamat sa crew for the 5 AM start! 💪',
    'Roof framing done for our project in {city}. Next week: roofing sheets and gutters.',
    'Rebar inspection passed today. Concrete pouring scheduled for Saturday.',
    'Tiling the master bathroom today — 60x120 large-format tiles, fully leveled.',
    'Rainy week but we kept moving: interior plastering on the ground floor is about 80% done.',
    'Turnover inspection with the owners tomorrow. Final cleaning today!',
  ],
  showcase: [
    'Finished! Two-storey home in {city}, turned over to a very happy family last week. 🏡',
    'Before-and-after of a project we completed this month. Swipe through the photos!',
    'Completed and turned over. Thank you to the owners for trusting our team.',
    'Another one done in {province}. Clean lines, durable materials, on budget.',
  ],
  looking_for_work: [
    'Mason with 8 years experience, available starting next week in {province}. CHB laying, plastering, tiles. Message me po.',
    'Certified welder (SMAW NC II) looking for project-based work in {province}. Can travel nearby.',
    'Carpenter available for cabinetry and finishing work. May sariling tools. 10+ years experience.',
    'Licensed electrician, available for house wiring and panel installation around {city}.',
  ],
  hiring: [
    'HIRING: 3 masons and 2 helpers for a residential project in {city}. 3-month project, daily rate + meals. Send a message!',
    'We are looking for a licensed electrician for a 4-storey building in {city}. PRC license required.',
    'Need 2 tile setters for a condo fit-out starting Monday in {city}. Experience with large tiles preferred.',
  ],
  looking_for_contractor: [
    'Looking for a contractor to build a 2-bedroom bungalow (about 80 sqm) in {city}. Lot is ready, budget around ₱2.5M. Please share your portfolio!',
    'Need a reliable plumber in {city} — leaking pipes under the kitchen sink and low water pressure upstairs.',
    'Planning a second-floor addition next year. Looking for an architect for plans and the building permit.',
    'Looking for someone to repaint our 2-storey house exterior in {city} before the holidays. Recommendations welcome!',
  ],
};
const COMMENTS = [
  'Ganda! 👏', 'How long did this take?', 'Interested po. Sent you a request.', 'Nice work, very clean finishing.', 'Available po ako, message sent.',
  'What brand of tiles did you use?', 'Congrats sa team!', 'Pwede po makahingi ng quotation?', 'Galing! Keep it up.', 'Saan po location nito?', 'Following this project 👀', 'Solid! 🔥',
];
const INQUIRIES = [
  'Good day! We are planning to build a 2-storey house on a 150 sqm lot. Can you send us a quotation and your available schedule?',
  'Hi po, magkano po ang estimate for a bathroom renovation (2x3 m)? Thank you.',
  'We need a quotation for a 60 sqm second-floor addition. Plans are ready.',
  'Hello! Are you available next month? We need repairs on our roof and gutters.',
  'Can you visit our site this weekend for an ocular inspection? We are in the city proper.',
];
const PRO_REPLIES = ['Hello po! Thank you for reaching out. Can we schedule a site visit this Saturday at 9 AM?', 'Good day! Yes, we are available. Could you send photos of the area and the lot size?'];
const CLIENT_REPLIES = ['Saturday works. Thank you!', 'Sent the photos to your Messenger po. Thanks!'];

/* ------------------------------------------------------------------ */
/* New demo members                                                    */
/* ------------------------------------------------------------------ */
const NEW_PROS = [
  { name: 'Dakila Design & Build', profession: 'general-contractor', province: 'Davao Del Sur', city: 'City of Davao', premium: true, services: ['House construction', 'Design & build', 'Renovation'], specs: ['Residential', 'Design & Build'] },
  { name: 'Mindanao Structural Engineers', profession: 'civil-engineer', province: 'Davao Del Sur', city: 'City of Davao', services: ['Structural design', 'Estimates (BOQ)', 'Permit plans'], specs: ['Structural Design'] },
  { name: 'Sinag Electrical Works', profession: 'electrician', province: 'Davao Del Sur', city: 'City of Digos', services: ['House wiring', 'Panel boards', 'Solar'], specs: ['House Wiring'] },
  { name: 'Tubig Plumbing Davao', profession: 'plumber', province: 'Davao Del Sur', city: 'City of Davao', services: ['Leak repair', 'Water lines', 'Septic tanks'], specs: ['Leak Repair'] },
  { name: 'Haligi Architects', profession: 'architect', province: 'Cebu', city: 'City of Cebu', premium: true, services: ['Architectural plans', '3D perspectives', 'Interior design'], specs: ['Residential Design', '3D Rendering'] },
  { name: 'Cebu Glass & Aluminum', profession: 'glass-aluminum', province: 'Cebu', city: 'City of Mandaue', services: ['Windows and doors', 'Storefronts', 'Shower enclosures'], specs: ['Aluminum Windows'] },
];
const WORKERS = [
  { name: 'Ramon Villanueva', profession: 'mason', province: 'Davao Del Sur', city: 'City of Davao', bio: 'Mason with 8 years experience in residential projects. CHB laying, plastering and tiles.' },
  { name: 'Joel Bautista', profession: 'welder', province: 'Pampanga', city: 'City of San Fernando', bio: 'SMAW NC II certified welder. Gates, grills, trusses and staircases.' },
  { name: 'Arnel Garcia', profession: 'carpenter', province: 'Cebu', city: 'City of Lapu-Lapu', bio: 'Finishing carpenter, 10+ years. Cabinets, ceilings, doors and built-ins. Own tools.' },
  { name: 'Rodel Mendoza', profession: 'electrician', province: 'Laguna', city: 'City of Santa Rosa', bio: 'Licensed electrician available for house wiring and panel installation.' },
];
const HIRERS = [
  { name: 'Golden Tower Construction Corp.', profession: 'general-contractor', province: 'Metro Manila', city: 'City of Pasig', bio: 'Mid-rise and commercial builder. We regularly hire skilled workers for projects around Metro Manila.' },
  { name: 'Buhay Homes Inc.', profession: 'general-contractor', province: 'Davao Del Sur', city: 'City of Davao', bio: 'Housing developer in Davao City hiring masons, carpenters and electricians for our subdivisions.' },
];
const HOMEOWNERS = [
  { name: 'Lia Cruz', province: 'Davao Del Sur', city: 'City of Davao', bio: 'Planning our first house in Davao City.' },
  { name: 'Carlo Reyes', province: 'Cebu', city: 'City of Talisay', bio: 'Renovating our family home in Talisay.' },
  { name: 'Grace Tan', province: 'Metro Manila', city: 'City of Makati', bio: 'Condo owner looking for good interior and repair people.' },
  { name: 'Mark Aquino', province: 'Iloilo', city: 'City of Iloilo', bio: 'Building a small rental property.' },
  { name: 'Ana Lopez', province: 'Laguna', city: 'City of Santa Rosa', bio: 'Second-floor addition planned for next year.' },
  { name: 'Paolo Ramos', province: 'Davao Del Sur', city: 'City of Davao', bio: 'Looking for a reliable team for our farmhouse.' },
  { name: 'Joy Santiago', province: 'Cavite', city: 'City of Dasmariñas', bio: 'New homeowner, lots of small projects ahead!' },
  { name: 'Ben Castillo', province: 'Batangas', city: 'Batangas City', bio: 'Building a beach house.' },
];

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */
const { env, dispose } = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: true });
const DB = env.DB;
const all = async (sql, ...params) => (await DB.prepare(sql).bind(...params).all()).results;

async function flush() {
  for (let i = 0; i < statements.length; i += 50) await DB.batch(statements.slice(i, i + 50).map(([sql, params]) => DB.prepare(sql).bind(...params)));
  statements.length = 0;
}

async function removeDemo() {
  const tables = ['reviews', 'notifications', 'post_comments', 'post_photos', 'posts', 'inquiry_messages', 'inquiries', 'project_updates', 'project_photos', 'projects', 'subscriptions'];
  for (const t of tables) run(`DELETE FROM ${t} WHERE id LIKE 'demo\\_%' ESCAPE '\\'`);
  run(`DELETE FROM user WHERE id LIKE 'demo\\_%' ESCAPE '\\'`); // cascades to their profiles, posts, hearts, reviews…
  for (const col of ['avatar_key', 'cover_key', 'logo_key']) run(`UPDATE profiles SET ${col} = NULL WHERE ${col} LIKE ?`, `%/${KEY_MARK}%`);
  await flush();
  let removed = 0;
  let cursorToken;
  do {
    const list = await env.BUCKET.list({ cursor: cursorToken, limit: 1000 });
    const keys = list.objects.map((o) => o.key).filter((k) => k.includes(`/${KEY_MARK}`));
    if (keys.length) await env.BUCKET.delete(keys);
    removed += keys.length;
    cursorToken = list.truncated ? list.cursor : undefined;
  } while (cursorToken);
  return removed;
}

try {
  const removedImages = await removeDemo();
  if (REMOVE) {
    console.log(`Removed all demo data (${removedImages} images).`);
    process.exit(0);
  }

  console.log('Downloading demo photos (first run only)…');
  await ensureImages();

  const passwordHash = hashPassword(DEV_PASSWORD);
  const members = []; // { userId, profileId, name, intent, province, city, professions, premium, username }

  function addMember({ name, intent, province, city, profession, bio, services = [], specs = [], premium = false, logoSet = 'logo', daysAgo }) {
    const base = slug(name).slice(0, 30).replace(/-$/, '');
    const userId = `demo_u_${base.replace(/-/g, '_')}`;
    const profileId = `demo_p_${base.replace(/-/g, '_')}`;
    const username = base;
    const created = now - daysAgo * DAY;
    insert('user', { id: userId, name, email: `${base}@demo.tibay.test`, email_verified: 1, role: 'user', banned: 0, two_factor_enabled: 0, created_at: created, updated_at: created });
    insert('account', { id: `demo_a_${base.replace(/-/g, '_')}`, account_id: userId, provider_id: 'credential', user_id: userId, password: passwordHash, created_at: created, updated_at: created });
    const avatar = intent === 'seeking_contractor' ? (rand() < 0.5 ? image('avatar', userId, 'house') : null) : image('avatar', userId, logoSet);
    const cover = intent === 'seeking_contractor' ? null : image('cover', userId, 'cover');
    insert('profiles', {
      id: profileId, user_id: userId, username, business_name: name, bio, services: JSON.stringify(services), years_experience: intent === 'seeking_contractor' ? null : between(3, 20), province, city,
      service_areas: JSON.stringify([province]), phone: `0917 ${between(100, 999)} ${between(1000, 9999)}`, contact_email: '', facebook_url: '', messenger_url: '',
      avatar_key: avatar?.key ?? null, cover_key: cover?.key ?? null, intent, is_published: 1, status: 'active', created_at: created, updated_at: created,
    });
    if (profession) insert('profile_professions', { profile_id: profileId, profession });
    for (const s of specs) insert('profile_specializations', { profile_id: profileId, specialization: s });
    if (premium) insert('subscriptions', { id: `demo_s_${base.replace(/-/g, '_')}`, user_id: userId, interval: 'monthly', status: 'active', price_amount: 0, current_period_start: now - 5 * DAY, current_period_end: now + 25 * DAY, cancel_at_period_end: 0, created_at: now - 5 * DAY, updated_at: now - 5 * DAY });
    const member = { userId, profileId, name, intent, province, city, professions: profession ? [profession] : [], premium, username, demo: true };
    members.push(member);
    return member;
  }

  NEW_PROS.forEach((p, i) => addMember({ ...p, intent: 'seeking_clients', bio: `${p.name} — trusted ${p.services[0].toLowerCase()} and more in ${p.city.replace('City of ', '')}, ${p.province}. Free ocular inspection and clear quotations.`, daysAgo: 60 - i * 5 }));
  WORKERS.forEach((w, i) => addMember({ ...w, intent: 'seeking_work', services: [], daysAgo: 30 - i * 3 }));
  HIRERS.forEach((h, i) => addMember({ ...h, intent: 'hiring', daysAgo: 50 - i * 10 }));
  HOMEOWNERS.forEach((h, i) => addMember({ ...h, intent: 'seeking_contractor', daysAgo: 25 - i * 2 }));

  // Existing profiles (from `pnpm db:seed` and your own accounts).
  const existing = await all(`
    SELECT p.id, p.user_id AS userId, p.username, p.business_name AS name, p.intent, p.province, p.city, p.avatar_key AS avatarKey, p.cover_key AS coverKey,
           (SELECT group_concat(profession) FROM profile_professions pp WHERE pp.profile_id = p.id) AS professions,
           EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id AND s.status = 'active' AND s.current_period_end > ?) AS premium
    FROM profiles p WHERE p.id NOT LIKE 'demo\\_%' ESCAPE '\\'`, now);
  for (const p of existing) {
    const professions = (p.professions ?? '').split(',').filter(Boolean);
    const set = TRADE_SET[professions[0]]?.[0] ?? 'construction';
    if (!p.avatarKey) {
      const img = image('avatar', p.userId, 'logo');
      if (img) run('UPDATE profiles SET avatar_key = ? WHERE id = ?', img.key, p.id);
    }
    if (!p.coverKey && p.intent !== 'seeking_contractor') {
      const img = image('cover', p.userId, 'cover');
      if (img) run('UPDATE profiles SET cover_key = ? WHERE id = ?', img.key, p.id);
    }
    members.push({ userId: p.userId, profileId: p.id, name: p.name, intent: p.intent, province: p.province, city: p.city, professions, premium: !!p.premium, username: p.username, demo: false, set, seeded: p.userId.startsWith('seed_') });
  }

  /* ---------------- Projects, photos and timelines ---------------- */
  const pros = members.filter((m) => m.intent === 'seeking_clients' || m.intent === 'hiring');
  const projectsByProfile = new Map();
  const existingProjects = await all(`SELECT pr.id, pr.profile_id AS profileId, pr.title, (SELECT COUNT(*) FROM project_photos ph WHERE ph.project_id = pr.id) AS photos FROM projects pr ORDER BY pr.created_at`);

  function addPhotos(projectId, member, set, count) {
    const photos = [];
    for (let i = 0; i < count; i++) {
      const img = image('project', member.userId, i % 3 === 2 ? (TRADE_SET[member.professions[0]]?.[1] ?? set) : set);
      if (!img) break;
      const id = demoId('ph');
      insert('project_photos', { id, project_id: projectId, profile_id: member.profileId, key: img.key, size_bytes: img.size, sort_order: i, created_at: now });
      photos.push(id);
    }
    return photos;
  }

  function addTimeline(projectId, member, startMsAgo, photos, count) {
    for (let i = 0; i < count; i++) {
      const [title, body] = UPDATES[i];
      insert('project_updates', { id: demoId('upd'), project_id: projectId, profile_id: member.profileId, date: day(startMsAgo - i * 12 * DAY), title, body, photo_id: photos[i] ?? null, created_at: now, updated_at: now });
    }
  }

  for (const member of pros) {
    const set = member.set ?? TRADE_SET[member.professions[0]]?.[0] ?? 'construction';
    const templates = shuffle(PROJECTS[set] ?? PROJECTS.construction);
    const photoCount = member.premium ? 4 : 2;
    const mine = existingProjects.filter((p) => p.profileId === member.profileId);

    if (member.seeded) {
      // Earlier seed data: give its projects real titles, a status, dates and photos.
      mine.forEach((p, i) => {
        const [title, description] = p.title === 'Recent project' || p.title === 'Two-storey residence' ? templates[i % templates.length] : [p.title, null];
        const ongoing = i === 0 && rand() < 0.5;
        const start = (ongoing ? between(40, 90) : between(200, 700)) * DAY;
        run(
          `UPDATE projects SET title = ?, description = COALESCE(?, description), location = ?, status = ?, start_date = ?, end_date = ?, year = ? WHERE id = ?`,
          title, description, `${member.city}, ${member.province}`, ongoing ? 'ongoing' : 'completed', day(start), ongoing ? null : day(start - between(60, 150) * DAY), Number(day(start).slice(0, 4)), p.id,
        );
        if (!p.photos) {
          const photos = addPhotos(p.id, member, set, photoCount);
          if (ongoing) addTimeline(p.id, member, start, photos, 4);
        }
      });
    }
    // Add projects to profiles that have none (yours included) and top up the earlier seed profiles.
    const wanted = member.premium ? 4 : 2;
    const add = member.seeded || member.demo ? Math.max(0, wanted - mine.length) : mine.length === 0 ? wanted : 0;
    const list = [];
    for (let i = 0; i < add; i++) {
      const [title, description] = templates[(i + mine.length) % templates.length];
      const ongoing = i === 0 && rand() < 0.6;
      const start = (ongoing ? between(30, 80) : between(150, 900)) * DAY;
      const id = demoId('prj');
      insert('projects', {
        id, profile_id: member.profileId, title, description, location: `${member.city}, ${member.province}`, year: Number(day(start).slice(0, 4)), status: ongoing ? 'ongoing' : 'completed',
        start_date: day(start), end_date: ongoing ? null : day(start - between(60, 150) * DAY), created_at: now - start, updated_at: now - start,
      });
      const photos = addPhotos(id, member, set, photoCount);
      if (ongoing) addTimeline(id, member, start, photos, between(3, 5));
      list.push({ id, title });
    }
    projectsByProfile.set(member.profileId, [...mine.map((p) => ({ id: p.id, title: p.title })), ...list]);
  }

  /* ---------------- Requests (inbox + private conversations) ---------------- */
  const homeowners = members.filter((m) => m.intent === 'seeking_contractor');
  const professionals = members.filter((m) => m.intent === 'seeking_clients');
  const contacted = new Set(); // `${proProfileId}|${userId}`
  for (const pro of professionals) {
    const senders = shuffle(homeowners).slice(0, pro.demo || pro.seeded ? between(1, 2) : 3);
    senders.forEach((client, i) => {
      const id = demoId('inq');
      const created = now - between(1, 20) * DAY - between(0, 20) * 3600_000;
      const conversation = i === 0;
      insert('inquiries', {
        id, profile_id: pro.profileId, name: client.name, contact: `${slug(client.name)}@demo.tibay.test`, message: pick(INQUIRIES), status: conversation ? 'new' : pick(['new', 'read']), email_sent: 1,
        thread_token: randomBytes(32).toString('base64url'), sender_user_id: client.userId, last_message_at: conversation ? created + 2 * 3600_000 : created, client_read_at: conversation ? created + 2 * 3600_000 : null, created_at: created,
      });
      if (conversation) {
        insert('inquiry_messages', { id: demoId('msg'), inquiry_id: id, sender: 'pro', body: pick(PRO_REPLIES), created_at: created + 3600_000 });
        insert('inquiry_messages', { id: demoId('msg'), inquiry_id: id, sender: 'client', body: pick(CLIENT_REPLIES), created_at: created + 2 * 3600_000 });
      }
      contacted.add(`${pro.profileId}|${client.userId}`);
    });
  }

  /* ---------------- Reviews ---------------- */
  const reviewers = members.filter((m) => m.demo);
  for (const pro of professionals) {
    const pool = shuffle(reviewers.filter((r) => r.userId !== pro.userId));
    const n = pro.premium ? between(5, 9) : between(2, 6);
    pool.slice(0, n).forEach((author) => {
      const r = rand();
      const rating = r < 0.6 ? 5 : r < 0.9 ? 4 : 3;
      const created = now - between(2, 120) * DAY;
      insert('reviews', {
        id: demoId('rev'), profile_id: pro.profileId, author_user_id: author.userId, rating, body: pick(REVIEW_TEXT[rating]), verified: contacted.has(`${pro.profileId}|${author.userId}`) || rand() < 0.3 ? 1 : 0,
        owner_reply: pro.demo && rand() < 0.45 ? pick(OWNER_REPLIES) : null, owner_reply_at: null, status: 'active', created_at: created, updated_at: created,
      });
    });
  }
  run(`UPDATE reviews SET owner_reply_at = created_at + 86400000 WHERE owner_reply IS NOT NULL AND id LIKE 'demo\\_%' ESCAPE '\\'`);

  /* ---------------- Community posts, hearts, comments ---------------- */
  const authors = members.filter((m) => m.demo || m.seeded);
  const kindFor = { seeking_clients: ['update', 'showcase', 'showcase', 'hiring'], seeking_work: ['looking_for_work'], hiring: ['hiring', 'update'], seeking_contractor: ['looking_for_contractor'] };
  const posts = [];
  for (let i = 0; i < 36; i++) {
    const author = i < 4 ? authors.filter((a) => a.premium && a.intent === 'seeking_clients')[i % 3] ?? pick(authors) : pick(authors);
    const kind = pick(kindFor[author.intent]);
    const created = i < 4 ? now - between(1, 40) * 3600_000 : now - between(1, 21) * DAY - between(0, 23) * 3600_000;
    const project = kind === 'showcase' ? pick(projectsByProfile.get(author.profileId) ?? [null]) : null;
    const body = pick(POSTS[kind]).replace('{city}', author.city.replace('City of ', '')).replace('{province}', author.province);
    const id = demoId('post');
    posts.push({ id, author, created });
    insert('posts', { id, profile_id: author.profileId, kind, body, project_id: project?.id ?? null, province: author.province, city: author.city, heart_count: 0, comment_count: 0, status: 'active', created_at: created, updated_at: created });
    const photoSet = { update: author.set ?? TRADE_SET[author.professions[0]]?.[0] ?? 'construction', showcase: author.set ?? TRADE_SET[author.professions[0]]?.[0] ?? 'house', hiring: 'construction', looking_for_work: TRADE_SET[author.professions[0]]?.[0] ?? 'construction', looking_for_contractor: 'house' }[kind];
    const photoCount = kind === 'showcase' ? between(2, 4) : kind === 'update' ? between(1, 2) : rand() < 0.3 ? 1 : 0;
    for (let p = 0; p < photoCount; p++) {
      const img = image('post', author.userId, photoSet);
      if (img) insert('post_photos', { id: demoId('pph'), post_id: id, profile_id: author.profileId, key: img.key, size_bytes: img.size, sort_order: p, created_at: created });
    }
    const fans = shuffle(members.filter((m) => m.demo && m.userId !== author.userId)).slice(0, between(0, 14));
    for (const fan of fans) insert('post_hearts', { post_id: id, user_id: fan.userId, created_at: created + between(1, 48) * 3600_000 }, 'INSERT OR IGNORE');
    const commenters = shuffle(members.filter((m) => m.demo && m.userId !== author.userId)).slice(0, between(0, 4));
    commenters.forEach((c, k) => insert('post_comments', { id: demoId('cmt'), post_id: id, profile_id: c.profileId, body: pick(COMMENTS), status: 'active', created_at: created + (k + 1) * between(1, 6) * 3600_000 }));
  }
  run(`UPDATE posts SET heart_count = (SELECT COUNT(*) FROM post_hearts h WHERE h.post_id = posts.id), comment_count = (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = posts.id AND c.status = 'active') WHERE id LIKE 'demo\\_%' ESCAPE '\\'`);

  /* ---------------- Write everything ---------------- */
  console.log(`Uploading ${uploads.length} images to the local bucket…`);
  for (let i = 0; i < uploads.length; i += 10) await Promise.all(uploads.slice(i, i + 10).map(([key, bytes]) => env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })));
  const count = statements.length;
  await flush();

  const totals = (await all(`SELECT (SELECT COUNT(*) FROM user WHERE id LIKE 'demo\\_%' ESCAPE '\\') AS members, (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM project_photos) AS photos,
    (SELECT COUNT(*) FROM posts) AS posts, (SELECT COUNT(*) FROM reviews) AS reviews, (SELECT COUNT(*) FROM inquiries) AS requests`))[0];
  console.log(`\nDemo data ready (${count} rows written).`);
  console.log(`  ${totals.members} demo members · ${totals.projects} projects · ${totals.photos} project photos · ${totals.posts} posts · ${totals.reviews} reviews · ${totals.requests} requests`);
  console.log(`  Demo logins use the password "${DEV_PASSWORD}", e.g. lia-cruz@demo.tibay.test (homeowner), dakila-design-build@demo.tibay.test (Premium contractor).`);
  console.log('  Remove it all with: pnpm db:seed:demo --remove');
} finally {
  await dispose();
}
