import { z } from 'zod';

export type PlanId = 'free' | 'premium';
export type BillingInterval = 'monthly' | 'annual';

const limitsSchema = z.object({
  projects: z.number().int().min(0).max(1000),
  photos: z.number().int().min(0).max(10000),
  quotationsPerMonth: z.number().int().min(0).max(100000),
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
  pricing: { monthly: 14_900, annual: 149_000 },
  limits: {
    free: {
      projects: 3,
      photos: 10,
      quotationsPerMonth: 3,
      customQuotationBranding: false,
      quotationHistory: false,
      customCoverPhoto: false,
      removePlatformBranding: false,
    },
    premium: {
      projects: 20,
      photos: 100,
      quotationsPerMonth: 50,
      customQuotationBranding: true,
      quotationHistory: true,
      customCoverPhoto: true,
      removePlatformBranding: true,
    },
  },
  renewalReminderDays: 5,
};

/** Upload constraints shared by client (pre-compression target) and server (hard validation). */
export const IMAGE_RULES = {
  maxBytes: 1_500_000,
  maxDimension: 1920,
  allowedTypes: ['image/webp', 'image/jpeg', 'image/png'] as const,
  maxPhotosPerProject: 12,
};
