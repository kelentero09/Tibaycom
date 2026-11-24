/** Shared (client + server) vocabulary for account intents, project timelines and the community feed. */

export const INTENTS = ['seeking_clients', 'hiring', 'seeking_work', 'seeking_contractor'] as const;
export type Intent = (typeof INTENTS)[number];

export const INTENT_INFO: Record<Intent, { label: string; short: string; description: string; badge: string }> = {
  seeking_clients: {
    label: 'I build for clients',
    short: 'Accepting clients',
    description: 'Contractor, engineer, architect or builder looking for homeowners and projects.',
    badge: 'Accepting clients',
  },
  hiring: {
    label: 'I hire workers',
    short: 'Hiring',
    description: 'You run projects and need masons, carpenters, electricians and other crew.',
    badge: 'Hiring',
  },
  seeking_work: {
    label: "I'm looking for work",
    short: 'Available for work',
    description: 'Skilled worker or tradesperson looking for your next job or crew.',
    badge: 'Available for work',
  },
  seeking_contractor: {
    label: "I'm looking for a contractor",
    short: 'Homeowner',
    description: 'You want to build or renovate and are looking for the right people.',
    badge: 'Looking for a contractor',
  },
};

/** Intents that are listed in the professional directory (homeowners are not). */
export const DIRECTORY_INTENTS = ['seeking_clients', 'hiring', 'seeking_work'] as const satisfies readonly Intent[];
export const isProfessionalIntent = (intent: string) => intent !== 'seeking_contractor';

export const PROJECT_STATUS_VALUES = ['planning', 'ongoing', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { planning: 'Planning', ongoing: 'Ongoing', completed: 'Completed' };

export const POST_KIND_VALUES = ['update', 'showcase', 'looking_for_work', 'hiring', 'looking_for_contractor'] as const;
export type PostKind = (typeof POST_KIND_VALUES)[number];
export const POST_KIND_LABELS: Record<PostKind, string> = {
  update: 'Update',
  showcase: 'Project showcase',
  looking_for_work: 'Looking for work',
  hiring: 'Hiring',
  looking_for_contractor: 'Looking for a contractor',
};

/** Formats a YYYY-MM-DD date for display without time zone drift. */
export function formatDay(value: string, locale = 'en-PH') {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Mar 2024 – Jun 2024", "Since Mar 2024", or the legacy year. */
export function projectPeriod(p: { startDate: string | null; endDate: string | null; year: number | null; status: string }) {
  const month = (v: string) => {
    const [y, m] = v.split('-').map(Number) as [number, number];
    return new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  };
  if (p.startDate && p.endDate) return `${month(p.startDate)} – ${month(p.endDate)}`;
  if (p.startDate) return p.status === 'completed' ? month(p.startDate) : `Since ${month(p.startDate)}`;
  if (p.endDate) return month(p.endDate);
  return p.year ? String(p.year) : '';
}

/** Short relative time for feed items ("5m", "3h", "2d", or a date). */
export function timeAgo(date: Date, now = Date.now()) {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(date);
}
