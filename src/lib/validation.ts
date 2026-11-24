import { z } from 'zod';
import locations from '@/data/ph-locations.json';
import { INTENTS, POST_KIND_VALUES, PROJECT_STATUS_VALUES } from './community';
import { isCustomProfession, isProfession, MAX_PROFESSIONS, MAX_SPECIALIZATIONS, specializationsFor } from './professions';

export const LOCATIONS = locations as Record<string, string[]>;
export const PROVINCES = Object.keys(LOCATIONS);

/** Paths that must never be claimed as a username. */
const RESERVED = new Set([
  'admin', 'api', 'account', 'login', 'register', 'pricing', 'directory', 'about', 'contact', 'privacy', 'terms', 'p', 'img',
  'tibay', 'support', 'help', 'www', 'root', 'null', 'undefined', 'settings', 'quotations', 'onboarding', 'billing', 'static', 'community', 'inbox',
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens only')
  .refine((u) => !u.includes('--'), 'Username cannot contain consecutive hyphens')
  .refine((u) => !RESERVED.has(u), 'That username is not available');

/** Plain text only: strips control characters; React escapes on output, so no HTML is ever rendered. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));

const httpsUrl = (hosts: string[], label: string) =>
  z
    .string()
    .trim()
    .max(200)
    .refine((v) => {
      if (v === '') return true;
      try {
        const url = new URL(v);
        return url.protocol === 'https:' && hosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
      } catch {
        return false;
      }
    }, `Enter a valid ${label} link (https://…)`);

const phPhone = z
  .string()
  .trim()
  .max(20)
  .refine((v) => v === '' || /^(\+63|0)[0-9 ()-]{9,14}$/.test(v), 'Enter a valid Philippine phone number');

const intent = z.enum(INTENTS, 'Choose what you are on Tibay for');

/** Homeowners looking for a contractor do not need a profession; everyone else needs at least one. */
const professionRequired = (v: { intent: string; professions: string[] }) => v.intent === 'seeking_contractor' || v.professions.length > 0;
const professionIssue = { path: ['professions'], message: 'Choose at least one profession' };

const professions = z
  .array(z.string())
  .max(MAX_PROFESSIONS, `Choose up to ${MAX_PROFESSIONS} professions`)
  // Either a listed profession or one the user typed under "Other".
  .refine((list) => list.every((p) => isProfession(p) || isCustomProfession(p)), 'Use letters and numbers only for a custom profession (2–40 characters)')
  .transform((list) => [...new Map(list.map((p) => [p.toLowerCase(), p])).values()]);

const location = {
  province: z.string().refine((p) => p in LOCATIONS, 'Choose a province'),
  city: z.string().min(1, 'Choose a city or municipality'),
};
const cityMatchesProvince = (v: { province: string; city: string }) => LOCATIONS[v.province]?.includes(v.city) ?? false;
const cityIssue = { path: ['city'], message: 'Choose a city or municipality in the selected province' };

export const onboardingSchema = z
  .object({ username: usernameSchema, intent, businessName: text(80).pipe(z.string().min(2, 'Business or display name is required')), professions, ...location })
  .refine(cityMatchesProvince, cityIssue)
  .refine(professionRequired, professionIssue);

export const profileUpdateSchema = z
  .object({
    intent,
    businessName: text(80).pipe(z.string().min(2, 'Business or display name is required')),
    bio: text(1500),
    professions,
    specializations: z.array(z.string().max(60)).max(MAX_SPECIALIZATIONS, `Choose up to ${MAX_SPECIALIZATIONS} specializations`),
    services: z.array(text(60).pipe(z.string().min(1))).max(15, 'List up to 15 services'),
    yearsExperience: z.number().int().min(0).max(70).nullable(),
    ...location,
    serviceAreas: z.array(z.string()).max(15).refine((list) => list.every((p) => p in LOCATIONS), 'Unknown province'),
    phone: phPhone,
    contactEmail: z.union([z.literal(''), z.email('Enter a valid email').max(120)]),
    facebookUrl: httpsUrl(['facebook.com', 'fb.com'], 'Facebook'),
    messengerUrl: httpsUrl(['m.me', 'messenger.com'], 'Messenger'),
    isPublished: z.boolean(),
  })
  .refine(cityMatchesProvince, cityIssue)
  .refine(professionRequired, professionIssue)
  .transform((v) => ({ ...v, specializations: v.specializations.filter((s) => specializationsFor(v.professions).includes(s)) }));

/** A real calendar date as YYYY-MM-DD. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Use a valid date');

export const projectSchema = z
  .object({
    title: text(100).pipe(z.string().min(2, 'Project title is required')),
    description: text(1500),
    location: text(100),
    year: z.number().int().min(1950).max(new Date().getFullYear() + 1).nullable(),
    // Optional so older clients that only send the original fields keep working.
    status: z.enum(PROJECT_STATUS_VALUES).default('completed'),
    startDate: isoDate.nullable().default(null),
    endDate: isoDate.nullable().default(null),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { path: ['endDate'], message: 'The end date must be after the start date' });

export const projectUpdateSchema = z.object({
  date: isoDate,
  title: text(100).pipe(z.string().min(2, 'Give this update a short title')),
  body: text(1500),
  photoId: z.string().max(64).nullable().default(null),
});

export const postSchema = z.object({
  kind: z.enum(POST_KIND_VALUES),
  body: text(2000).pipe(z.string().min(2, 'Write something first')),
  projectId: z.string().max(64).nullable().default(null),
});

export const commentSchema = z.object({
  body: text(1000).pipe(z.string().min(1, 'Write a comment first')),
});

export const feedQuerySchema = z.object({
  kind: z.enum(POST_KIND_VALUES).optional().catch(undefined),
  province: z.string().refine((p) => p in LOCATIONS).optional().catch(undefined),
  /** Cursor: created_at (ms) of the last post on the previous page. */
  before: z.coerce.number().int().positive().optional().catch(undefined),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Choose a star rating').max(5),
  body: text(1000).pipe(z.string().min(10, 'Write at least a sentence about the work')),
});

export const reviewReplySchema = z.object({
  /** Empty removes the reply. */
  body: text(1000),
});

export const reviewReportSchema = z.object({
  reason: z.enum(['spam', 'fake', 'inappropriate', 'scam', 'other']),
  details: text(1000),
});

export const contentReportSchema = z.object({
  postId: z.string().min(1).max(64),
  commentId: z.string().min(1).max(64).nullable().default(null),
  reason: z.enum(['spam', 'fake', 'inappropriate', 'scam', 'other']),
  details: text(1000),
});

export const inquirySchema = z.object({
  name: text(80).pipe(z.string().min(2, 'Your name is required')),
  contact: text(120).pipe(z.string().min(5, 'Enter a phone number or email so they can reach you')),
  message: text(1500).pipe(z.string().min(10, 'Tell them a little about your project')),
  turnstileToken: z.string().min(1).max(4096),
});

export const inquiryReplySchema = z.object({
  body: text(2000).pipe(z.string().min(1, 'Write a message first')),
});

export const reportSchema = z.object({
  username: usernameSchema,
  reason: z.enum(['spam', 'fake', 'inappropriate', 'scam', 'other']),
  details: text(1000),
  reporterEmail: z.union([z.literal(''), z.email().max(120)]),
  turnstileToken: z.string().min(1).max(4096),
});

export const contactFormSchema = z.object({
  name: text(80).pipe(z.string().min(2, 'Your name is required')),
  email: z.email('Enter a valid email').max(120),
  message: text(2000).pipe(z.string().min(10, 'Message is too short')),
  turnstileToken: z.string().min(1).max(4096),
});

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  profession: z.string().refine(isProfession).optional().catch(undefined),
  specialization: z.string().max(60).optional(),
  province: z.string().refine((p) => p in LOCATIONS).optional().catch(undefined),
  city: z.string().max(80).optional(),
  intent: z.enum(INTENTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type PostInput = z.infer<typeof postSchema>;
export type FeedQuery = z.infer<typeof feedQuerySchema>;
