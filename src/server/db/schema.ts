import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });
const bool = (name: string) => integer(name, { mode: 'boolean' });
const now = sql`(unixepoch() * 1000)`;

/* ------------------------------------------------------------------ */
/* Better Auth tables (core + admin + two-factor plugins)              */
/* ------------------------------------------------------------------ */

export const user = sqliteTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: bool('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
    role: text('role').default('user'),
    banned: bool('banned').default(false),
    banReason: text('ban_reason'),
    banExpires: ts('ban_expires'),
    twoFactorEnabled: bool('two_factor_enabled').default(false),
  },
  (t) => [index('user_created_idx').on(t.createdAt)],
);

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: ts('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: ts('access_token_expires_at'),
    refreshTokenExpiresAt: ts('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: ts('expires_at').notNull(),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

export const twoFactor = sqliteTable(
  'two_factor',
  {
    id: text('id').primaryKey(),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: bool('verified').default(true),
    failedVerificationCount: integer('failed_verification_count').default(0),
    lockedUntil: ts('locked_until'),
  },
  (t) => [index('two_factor_user_idx').on(t.userId), index('two_factor_secret_idx').on(t.secret)],
);

export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('last_request').notNull(),
});

/* ------------------------------------------------------------------ */
/* Profiles & portfolio                                                */
/* ------------------------------------------------------------------ */

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull().unique(),
    businessName: text('business_name').notNull(),
    bio: text('bio').notNull().default(''),
    services: text('services', { mode: 'json' }).$type<string[]>().notNull().default([]),
    yearsExperience: integer('years_experience'),
    province: text('province').notNull().default(''),
    city: text('city').notNull().default(''),
    serviceAreas: text('service_areas', { mode: 'json' }).$type<string[]>().notNull().default([]),
    phone: text('phone').notNull().default(''),
    contactEmail: text('contact_email').notNull().default(''),
    facebookUrl: text('facebook_url').notNull().default(''),
    messengerUrl: text('messenger_url').notNull().default(''),
    avatarKey: text('avatar_key'),
    logoKey: text('logo_key'),
    coverKey: text('cover_key'),
    /** Owner-controlled visibility in the directory. */
    isPublished: bool('is_published').notNull().default(true),
    /** Moderation state, admin-controlled. */
    status: text('status', { enum: ['active', 'suspended'] })
      .notNull()
      .default('active'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [
    index('profiles_location_idx').on(t.province, t.city),
    index('profiles_listing_idx').on(t.status, t.isPublished, t.updatedAt),
  ],
);

export const profileProfessions = sqliteTable(
  'profile_professions',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    profession: text('profession').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.profession] }), index('profile_professions_profession_idx').on(t.profession)],
);

export const profileSpecializations = sqliteTable(
  'profile_specializations',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    specialization: text('specialization').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.specialization] }),
    index('profile_specializations_spec_idx').on(t.specialization),
  ],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    location: text('location').notNull().default(''),
    year: integer('year'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('projects_profile_idx').on(t.profileId, t.createdAt)],
);

export const projectPhotos = sqliteTable(
  'project_photos',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** Denormalised so the per-profile photo quota is a single indexed count. */
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('project_photos_project_idx').on(t.projectId, t.sortOrder), index('project_photos_profile_idx').on(t.profileId)],
);

/* ------------------------------------------------------------------ */
/* Quotations                                                          */
/* ------------------------------------------------------------------ */

export type QuotationItemRow = {
  type: 'material' | 'labor' | 'service';
  description: string;
  quantity: number;
  unit: string;
  /** centavos */
  unitPrice: number;
};

export const quotations = sqliteTable(
  'quotations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    title: text('title').notNull().default(''),
    clientName: text('client_name').notNull(),
    clientAddress: text('client_address').notNull().default(''),
    clientContact: text('client_contact').notNull().default(''),
    /** ISO date (YYYY-MM-DD) */
    issueDate: text('issue_date').notNull(),
    validUntil: text('valid_until').notNull(),
    items: text('items', { mode: 'json' }).$type<QuotationItemRow[]>().notNull(),
    discountType: text('discount_type', { enum: ['none', 'percent', 'fixed'] })
      .notNull()
      .default('none'),
    /** basis points when percent, centavos when fixed */
    discountValue: integer('discount_value').notNull().default(0),
    /** basis points, 0 = no tax, 1200 = 12% VAT */
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    paymentTerms: text('payment_terms').notNull().default(''),
    notes: text('notes').notNull().default(''),
    /** Server-computed totals in centavos. */
    subtotal: integer('subtotal').notNull(),
    discountAmount: integer('discount_amount').notNull(),
    taxAmount: integer('tax_amount').notNull(),
    total: integer('total').notNull(),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('quotations_user_idx').on(t.userId, t.createdAt)],
);

/** Monthly usage counters (period = YYYY-MM in Asia/Manila). Deleting a quotation never refunds quota. */
export const usageCounters = sqliteTable(
  'usage_counters',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    kind: text('kind', { enum: ['quotation'] }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period, t.kind] })],
);

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    interval: text('interval', { enum: ['monthly', 'annual'] }).notNull(),
    /** active = paid period running; expired = period ended unpaid; revoked = refunded / admin-removed */
    status: text('status', { enum: ['active', 'expired', 'revoked'] }).notNull(),
    /** Price paid for the current period, centavos. Basis for MRR/ARR. */
    priceAmount: integer('price_amount').notNull(),
    currentPeriodStart: ts('current_period_start').notNull(),
    currentPeriodEnd: ts('current_period_end').notNull(),
    /** User opted out of renewal reminders ("cancelled"); access continues until period end. */
    cancelAtPeriodEnd: bool('cancel_at_period_end').notNull().default(false),
    reminderSentAt: ts('reminder_sent_at'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('subscriptions_status_end_idx').on(t.status, t.currentPeriodEnd)],
);

export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    /** Nullable: payment records outlive a deleted account (retained for accounting), detached from the person. */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    interval: text('interval', { enum: ['monthly', 'annual'] }).notNull(),
    status: text('status', { enum: ['pending', 'paid', 'failed', 'expired', 'refunded'] })
      .notNull()
      .default('pending'),
    /** Expected amount (centavos) fixed server-side when the checkout was created. */
    amount: integer('amount').notNull(),
    fee: integer('fee').notNull().default(0),
    netAmount: integer('net_amount').notNull().default(0),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    checkoutSessionId: text('checkout_session_id').unique(),
    /** PayMongo payment id (pay_...). Unique => a payment can only ever be applied once. */
    providerPaymentId: text('provider_payment_id').unique(),
    paymentMethod: text('payment_method'),
    livemode: bool('livemode').notNull().default(false),
    periodStart: ts('period_start'),
    periodEnd: ts('period_end'),
    paidAt: ts('paid_at'),
    failureReason: text('failure_reason'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('payments_user_idx').on(t.userId, t.createdAt), index('payments_status_paid_idx').on(t.status, t.paidAt)],
);

/** Processed webhook event ids — replay protection / idempotency. */
export const webhookEvents = sqliteTable('webhook_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: ts('received_at').notNull().default(now),
});

/* ------------------------------------------------------------------ */
/* Moderation, audit, settings                                         */
/* ------------------------------------------------------------------ */

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: ['spam', 'fake', 'inappropriate', 'scam', 'other'] }).notNull(),
    details: text('details').notNull().default(''),
    reporterEmail: text('reporter_email').notNull().default(''),
    status: text('status', { enum: ['open', 'resolved', 'dismissed'] })
      .notNull()
      .default('open'),
    resolvedBy: text('resolved_by'),
    resolvedAt: ts('resolved_at'),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('reports_status_idx').on(t.status, t.createdAt)],
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    actorType: text('actor_type', { enum: ['admin', 'user', 'system'] }).notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
    ip: text('ip'),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('audit_logs_created_idx').on(t.createdAt), index('audit_logs_action_idx').on(t.action, t.createdAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: ts('updated_at').notNull().default(now),
});
