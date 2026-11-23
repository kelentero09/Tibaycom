export type Profession = { slug: string; label: string; specializations: string[] };

/** Curated taxonomy. Slugs are stored in the database — rename labels freely, never slugs. */
export const PROFESSIONS: Profession[] = [
  { slug: 'general-contractor', label: 'General Contractor', specializations: ['Residential', 'Commercial', 'Renovation', 'Design & Build', 'Fit-out', 'Industrial'] },
  { slug: 'architect', label: 'Architect', specializations: ['Residential Design', 'Commercial Design', 'Interior Architecture', 'Landscape', 'Permit Plans', '3D Rendering'] },
  { slug: 'civil-engineer', label: 'Civil Engineer', specializations: ['Structural Design', 'Site Supervision', 'Estimates (BOQ)', 'Permit Plans', 'Roads & Drainage', 'Retrofitting'] },
  { slug: 'electrical-engineer', label: 'Electrical Engineer', specializations: ['Electrical Plans', 'Solar PV', 'Industrial Power', 'Permit Plans'] },
  { slug: 'mechanical-engineer', label: 'Mechanical Engineer', specializations: ['HVAC', 'Fire Protection', 'Mechanical Plans'] },
  { slug: 'sanitary-engineer', label: 'Sanitary Engineer / Master Plumber', specializations: ['Plumbing Plans', 'Septic & Drainage', 'Water Supply'] },
  { slug: 'interior-designer', label: 'Interior Designer', specializations: ['Residential Interiors', 'Commercial Interiors', 'Modular Cabinets', 'Styling'] },
  { slug: 'foreman', label: 'Foreman', specializations: ['Residential', 'Commercial', 'Site Management'] },
  { slug: 'mason', label: 'Mason', specializations: ['CHB Laying', 'Plastering', 'Concrete Works', 'Stonework'] },
  { slug: 'carpenter', label: 'Carpenter', specializations: ['Formworks', 'Roof Framing', 'Finishing Carpentry', 'Cabinetry', 'Doors & Windows'] },
  { slug: 'electrician', label: 'Electrician', specializations: ['House Wiring', 'Panel Boards', 'Lighting', 'CCTV & Low Voltage', 'Troubleshooting'] },
  { slug: 'plumber', label: 'Plumber', specializations: ['Water Lines', 'Drainage', 'Fixtures', 'Leak Repair', 'Water Tanks & Pumps'] },
  { slug: 'painter', label: 'Painter', specializations: ['Interior', 'Exterior', 'Waterproofing', 'Epoxy', 'Decorative Finishes'] },
  { slug: 'welder', label: 'Welder / Steel Fabricator', specializations: ['Gates & Grills', 'Steel Trusses', 'Railings', 'Structural Steel'] },
  { slug: 'tile-setter', label: 'Tile Setter', specializations: ['Floor Tiles', 'Wall Tiles', 'Natural Stone', 'Vinyl & SPC'] },
  { slug: 'roofer', label: 'Roofer', specializations: ['Metal Roofing', 'Gutters', 'Roof Repair', 'Insulation'] },
  { slug: 'glass-aluminum', label: 'Glass & Aluminum Installer', specializations: ['Windows', 'Sliding Doors', 'Shower Enclosures', 'Storefronts'] },
  { slug: 'hvac-technician', label: 'Aircon / HVAC Technician', specializations: ['Installation', 'Cleaning', 'Repair', 'Ducting'] },
  { slug: 'landscaper', label: 'Landscaper', specializations: ['Garden Design', 'Hardscape', 'Maintenance'] },
  { slug: 'heavy-equipment', label: 'Heavy Equipment Operator', specializations: ['Excavation', 'Hauling', 'Demolition', 'Equipment Rental'] },
  { slug: 'supplier', label: 'Materials Supplier', specializations: ['Aggregates', 'Lumber', 'Steel', 'Hardware', 'Ready-mix Concrete'] },
];

const bySlug = new Map(PROFESSIONS.map((p) => [p.slug, p]));

/** Listed professions are stored as slugs; anything else is a profession the user typed themselves ("Other"). */
export const professionLabel = (value: string) => bySlug.get(value)?.label ?? value;
export const isProfession = (slug: string) => bySlug.has(slug);

/** Letters, numbers and ordinary punctuation only — 2 to 40 characters. Rendered as text, never as HTML. */
const CUSTOM_PROFESSION = /^[\p{L}\p{N}][\p{L}\p{N} &/.,'()-]{1,39}$/u;
export const isCustomProfession = (value: string) => !bySlug.has(value) && CUSTOM_PROFESSION.test(value);

/**
 * Cleans what a user typed in "Other". If it matches a listed profession (by name), the listed one is used
 * so the profile still appears under that directory filter.
 */
export function normalizeProfession(input: string): string | null {
  const text = input.replace(/\s+/g, ' ').trim();
  if (bySlug.has(text)) return text;
  const listed = PROFESSIONS.find((p) => p.label.toLowerCase() === text.toLowerCase());
  if (listed) return listed.slug;
  return CUSTOM_PROFESSION.test(text) ? text : null;
}

/** Specializations valid for the given professions, de-duplicated. */
export function specializationsFor(professionSlugs: string[]): string[] {
  const set = new Set<string>();
  for (const slug of professionSlugs) bySlug.get(slug)?.specializations.forEach((s) => set.add(s));
  return [...set];
}

export const ALL_SPECIALIZATIONS = [...new Set(PROFESSIONS.flatMap((p) => p.specializations))].sort();
export const MAX_PROFESSIONS = 6;
export const MAX_SPECIALIZATIONS = 8;
