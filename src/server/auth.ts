import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, captcha, twoFactor } from 'better-auth/plugins';
import { audit } from './audit';
import { getDb, getEnv, schema } from './db';
import { sendEmail } from './email';
import { hashPassword, verifyPassword } from './password';
import { deleteUserImages } from './storage';

export const getAuth = () => {
  const env = getEnv();
  const production = env.APP_ENV === 'production';
  return betterAuth({
    appName: 'Tibay',
    baseURL: env.PUBLIC_SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_SITE_URL],
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Tibay password',
          heading: 'Reset your password',
          paragraphs: ['We received a request to reset your password. This link expires in 1 hour. If you did not ask for it, you can ignore this email.'],
          action: { label: 'Choose a new password', url },
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Confirm your email for Tibay',
          heading: `Welcome to Tibay, ${user.name}`,
          paragraphs: ['Confirm your email address to activate your account and publish your profile.'],
          action: { label: 'Confirm email', url },
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        // Remove the user's images from R2 first; database rows cascade from the user record.
        beforeDelete: async (user) => {
          await deleteUserImages(user.id);
          await audit({ actorId: user.id, actorType: 'user', action: 'account.deleted' });
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // Brute-force protection, persisted in D1 so it holds across Worker isolates.
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 300, max: 8 },
        '/sign-up/email': { window: 3600, max: 6 },
        '/request-password-reset': { window: 3600, max: 4 },
        '/send-verification-email': { window: 3600, max: 4 },
        '/two-factor/*': { window: 300, max: 8 },
      },
    },
    advanced: {
      useSecureCookies: production,
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    plugins: [
      admin(),
      twoFactor({ issuer: 'Tibay' }),
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: env.TURNSTILE_SECRET_KEY,
        endpoints: ['/sign-up/email', '/sign-in/email', '/request-password-reset'],
      }),
    ],
  });
};

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>['user'];

/** Memoised per render pass; always validated against the database (so bans and revocations apply at once). */
export const getSession = cache(async () => getAuth().api.getSession({ headers: await headers() }));

export async function requireUser(returnTo?: string) {
  const session = await getSession();
  if (!session) redirect(`/login${returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''}`);
  return session.user;
}

export const isAdmin = (user: { role?: string | null }) => user.role === 'admin';

/** Admin area gate: admin role AND two-factor authentication enabled. */
export async function requireAdmin() {
  const user = await requireUser('/admin');
  if (!isAdmin(user)) redirect('/');
  if (!user.twoFactorEnabled) redirect('/account/security?required=2fa');
  return user;
}
