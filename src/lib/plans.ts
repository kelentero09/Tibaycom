import { z } from 'zod';

export type PlanId = 'free' | 'premium';
export type BillingInterval = 'monthly' | 'annual';

const limitsSchema = z.object({
  projects: z.number().int().min(0).max(1000),
  /** Maximum photos in ONE project. */
  photosPerProject: z.number().int().min(0).max(50),
  /** Quotations that can be created per calendar month. `null` = unlimited. */
  quotationsPerMonth: z.number().int().min(0).max(100000).nullable(),
  /** Timeline entries in ONE project. Defaults keep older stored configs valid. */
  updatesPerProject: z.number().int().min(0).max(500).default(3),
  /** Community posts per day (Manila time). `null` = unlimited. */
  postsPerDay: z.number().int().min(0).max(1000).nullable().default(3),
  customQuotationBranding: z.boolean(),
  quotationHistory: z.boolean(),
  customCoverPhoto: z.boolean(),
  removePlatformBranding: z.boolean(),
});

export const planConfigSchema = z.object({
  /** centavos */
  pricing: z.object({
    monthly: z.number().int().min(2000).max(10_000_000),
    annual: z.number().int().min(2000).max(100_000_000),
  }),
  limits: z.object({ free: limitsSchema, premium: limitsSchema }),
  /** Days before period end when the renewal reminder email is sent. */
  renewalReminderDays: z.number().int().min(1).max(30),
});

export type PlanLimits = z.infer<typeof limitsSchema>;
export type PlanConfig = z.infer<typeof planConfigSchema>;

/** Defaults; a Super Admin can override them in Platform Settings (stored in the `settings` table). */
export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  // ₱399 / month, ₱3,990 / year (saves ₱798 against twelve monthly payments)
  pricing: { monthly: 39_900, annual: 399_000 },
  limits: {
    free: {
      projects: 2,
      photosPerProject: 2,
      quotationsPerMonth: 2,
      updatesPerProject: 3,
      postsPerDay: 3,
      customQuotationBranding: false,
      quotationHistory: false,
      customCoverPhoto: false,
      removePlatformBranding: false,
    },
    premium: {
      projects: 50,
      photosPerProject: 10,
      quotationsPerMonth: null,
      updatesPerProject: 30,
      postsPerDay: null,
      customQuotationBranding: true,
      quotationHistory: true,
      customCoverPhoto: true,
      removePlatformBranding: true,
    },
  },
  renewalReminderDays: 5,
};

/** "Unlimited" or the number, for display. */
export const formatQuota = (value: number | null) => (value === null ? 'Unlimited' : String(value));

/** Upload constraints shared by client (pre-compression target) and server (hard validation). */
/** Spam guard for comments; the same for every plan. */
export const COMMENTS_PER_DAY = 30;
/** Photos attached to one community post. */
export const PHOTOS_PER_POST = 4;

export const IMAGE_RULES = {
  maxBytes: 1_500_000,
  maxDimension: 1920,
  allowedTypes: ['image/webp', 'image/jpeg', 'image/png'] as const,
};
