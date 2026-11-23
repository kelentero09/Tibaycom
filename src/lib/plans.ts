import { z } from 'zod';

export type PlanId = 'free' | 'premium';
export type BillingInterval = 'monthly' | 'annual';

const limitsSchema = z.object({
  projects: z.number().int().min(0).max(1000),
  /** Maximum photos in ONE project. */
  photosPerProject: z.number().int().min(0).max(50),
  /** Quotations that can be created per calendar month. `null` = unlimited. */
  quotationsPerMonth: z.number().int().min(0).max(100000).nullable(),
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
      customQuotationBranding: false,
      quotationHistory: false,
      customCoverPhoto: false,
      removePlatformBranding: false,
    },
    premium: {
      projects: 50,
      photosPerProject: 10,
      quotationsPerMonth: null,
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
export const IMAGE_RULES = {
  maxBytes: 1_500_000,
  maxDimension: 1920,
  allowedTypes: ['image/webp', 'image/jpeg', 'image/png'] as const,
};
