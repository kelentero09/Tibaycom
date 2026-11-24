import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
// Relative import: drizzle-kit does not resolve the @/ alias.
import { INTENTS as PROFILE_INTENTS, POST_KIND_VALUES as POST_KINDS, PROJECT_STATUS_VALUES as PROJECT_STATUSES } from '../../lib/community';

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
    /** What the member is on Tibay for; drives the directory, badges and which sections show. */
    intent: text('intent', { enum: PROFILE_INTENTS }).notNull().default('seeking_clients'),
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
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('completed'),
    /** Calendar dates as YYYY-MM-DD (no time zone ambiguity). */
    startDate: text('start_date'),
    endDate: text('end_date'),
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

/** Progress log entries shown as a timeline on the project page. */
export const projectUpdates = sqliteTable(
  'project_updates',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    photoId: text('photo_id').references(() => projectPhotos.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [index('project_updates_project_idx').on(t.projectId, t.date)],
);

/* ------------------------------------------------------------------ */
/* Community                                                           */
/* ------------------------------------------------------------------ */

export const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: POST_KINDS }).notNull().default('update'),
    body: text('body').notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    province: text('province').notNull().default(''),
    city: text('city').notNull().default(''),
    heartCount: integer('heart_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    /** Moderation state, admin-controlled. */
    status: text('status', { enum: ['active', 'hidden'] })
      .notNull()
      .default('active'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [
    index('posts_feed_idx').on(t.status, t.createdAt),
    index('posts_kind_idx').on(t.kind, t.createdAt),
    index('posts_province_idx').on(t.province, t.createdAt),
    index('posts_profile_idx').on(t.profileId, t.createdAt),
  ],
);

export const postPhotos = sqliteTable(
  'post_photos',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    key: text('key').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('post_photos_post_idx').on(t.postId, t.sortOrder)],
);

export const postHearts = sqliteTable(
  'post_hearts',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index('post_hearts_user_idx').on(t.userId)],
);

export const postComments = sqliteTable(
  'post_comments',
  {
    id: text('id').primaryKey(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    status: text('status', { enum: ['active', 'hidden'] })
      .notNull()
      .default('active'),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('post_comments_post_idx').on(t.postId, t.createdAt)],
);

/** In-app notifications (read on page load; no realtime push). */
export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['heart', 'comment'] }).notNull(),
    actorProfileId: text('actor_profile_id').references(() => profiles.id, { onDelete: 'cascade' }),
    postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    readAt: ts('read_at'),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
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
    /** Unguessable token for the read-only client link (/q/<token>). NULL = not shared. */
    shareToken: text('share_token').unique(),
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
    /** Quotations count per month (YYYY-MM); posts and comments per day (YYYY-MM-DD). */
    kind: text('kind', { enum: ['quotation', 'post', 'comment'] }).notNull(),
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

/**
 * Star ratings (1–5) with a written review. One per member per profile (editing replaces it).
 * `verified` = the author had sent this professional a quotation request while signed in.
 */
export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body').notNull(),
    verified: bool('verified').notNull().default(false),
    ownerReply: text('owner_reply'),
    ownerReplyAt: ts('owner_reply_at'),
    status: text('status', { enum: ['active', 'hidden'] })
      .notNull()
      .default('active'),
    createdAt: ts('created_at').notNull().default(now),
    updatedAt: ts('updated_at').notNull().default(now),
  },
  (t) => [uniqueIndex('reviews_profile_author_idx').on(t.profileId, t.authorUserId), index('reviews_profile_idx').on(t.profileId, t.status, t.createdAt), index('reviews_author_idx').on(t.authorUserId)],
);

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Set when a community post or comment is reported (profileId is then its author). */
    postId: text('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    commentId: text('comment_id').references(() => postComments.id, { onDelete: 'cascade' }),
    /** Set when a review is reported (profileId is then the reviewed profile). */
    reviewId: text('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
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

/** Quotation requests sent by visitors from a public profile. Kept so a lead survives a lost email; purged after 180 days. */
export const inquiries = sqliteTable(
  'inquiries',
  {
    id: text('id').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contact: text('contact').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: ['new', 'read', 'archived'] })
      .notNull()
      .default('new'),
    emailSent: bool('email_sent').notNull().default(false),
    /** Secret for the client's private conversation link (/r/<token>). NULL on requests sent before replies existed. */
    threadToken: text('thread_token').unique(),
    /** Set when the client was signed in, so the request also shows under their account. */
    senderUserId: text('sender_user_id').references(() => user.id, { onDelete: 'set null' }),
    /** Last message in either direction; drives ordering and the retention window. */
    lastMessageAt: ts('last_message_at'),
    /** When the client last opened the conversation; replies after this are unread for them. */
    clientReadAt: ts('client_read_at'),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('inquiries_profile_idx').on(t.profileId, t.status, t.createdAt), index('inquiries_sender_idx').on(t.senderUserId)],
);

/** Replies in a quotation-request conversation (the client's first message stays on `inquiries.message`). */
export const inquiryMessages = sqliteTable(
  'inquiry_messages',
  {
    id: text('id').primaryKey(),
    inquiryId: text('inquiry_id')
      .notNull()
      .references(() => inquiries.id, { onDelete: 'cascade' }),
    sender: text('sender', { enum: ['pro', 'client'] }).notNull(),
    body: text('body').notNull(),
    createdAt: ts('created_at').notNull().default(now),
  },
  (t) => [index('inquiry_messages_inquiry_idx').on(t.inquiryId, t.createdAt)],
);

/** Operational problems (failed emails, payment errors…). One row per kind; used to throttle notifications. */
export const alerts = sqliteTable('alerts', {
  kind: text('kind').primaryKey(),
  lastMessage: text('last_message').notNull(),
  count: integer('count').notNull().default(1),
  /** Occurrences since the last notification was sent. */
  pendingCount: integer('pending_count').notNull().default(1),
  firstSeenAt: ts('first_seen_at').notNull().default(now),
  lastSeenAt: ts('last_seen_at').notNull().default(now),
  lastNotifiedAt: ts('last_notified_at'),
});

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
