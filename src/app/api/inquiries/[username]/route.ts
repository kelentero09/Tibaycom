import { and, eq } from 'drizzle-orm';
import { inquirySchema } from '@/lib/validation';
import { getDb, getEnv, schema } from '@/server/db';
import { sendEmail } from '@/server/email';
import { ApiError, parseBody, route, verifyTurnstile } from '@/server/http';

const { profiles, user } = schema;

/** Visitor → professional quotation request. Delivered by email only; nothing is stored (data minimisation). */
export const POST = route<'public', { username: string }>({ access: 'public', limit: { name: 'inquiry', max: 5, windowSeconds: 3600 } }, async ({ request, params, ip }) => {
  const input = await parseBody(request, inquirySchema);
  await verifyTurnstile(input.turnstileToken, ip);

  const target = await getDb()
    .select({ businessName: profiles.businessName, contactEmail: profiles.contactEmail, accountEmail: user.email, username: profiles.username })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(profiles.username, params.username.toLowerCase()), eq(profiles.status, 'active'), eq(profiles.isPublished, true)))
    .get();
  if (!target) throw new ApiError(404, 'Profile not found.');

  const sent = await sendEmail({
    to: target.contactEmail || target.accountEmail,
    subject: `New quotation request from ${input.name}`,
    heading: 'You have a new quotation request',
    paragraphs: [
      `${input.name} sent a request through your Tibay profile.`,
      `Contact: ${input.contact}`,
      `Message:\n${input.message}`,
      'Reply to them directly using the contact details above. Tibay never shares your email address with visitors.',
    ],
    action: { label: 'Create a quotation', url: `${getEnv().PUBLIC_SITE_URL}/quotations/new` },
  });
  if (!sent && getEnv().APP_ENV === 'production') throw new ApiError(502, 'We could not deliver your message. Please use the contact details on the profile.');
  return { ok: true };
});
