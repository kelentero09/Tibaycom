import { and, eq } from 'drizzle-orm';
import { inquirySchema } from '@/lib/validation';
import { getDb, getEnv, newId, schema } from '@/server/db';
import { sendEmail } from '@/server/email';
import { ApiError, parseBody, route, verifyTurnstile } from '@/server/http';

const { profiles, user, inquiries } = schema;

/**
 * Visitor → professional quotation request.
 * The request is saved to the professional's inbox FIRST, then emailed — so a lost or spam-filtered
 * email never loses the lead.
 */
export const POST = route<'public', { username: string }>({ access: 'public', limit: { name: 'inquiry', max: 5, windowSeconds: 3600 } }, async ({ request, params, ip }) => {
  const input = await parseBody(request, inquirySchema);
  await verifyTurnstile(input.turnstileToken, ip);

  const db = getDb();
  const target = await db
    .select({ id: profiles.id, businessName: profiles.businessName, contactEmail: profiles.contactEmail, accountEmail: user.email })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(and(eq(profiles.username, params.username.toLowerCase()), eq(profiles.status, 'active'), eq(profiles.isPublished, true)))
    .get();
  if (!target) throw new ApiError(404, 'Profile not found.');

  const id = newId();
  await db.insert(inquiries).values({ id, profileId: target.id, name: input.name, contact: input.contact, message: input.message });

  const sent = await sendEmail({
    to: target.contactEmail || target.accountEmail,
    subject: `New quotation request from ${input.name}`,
    heading: 'You have a new quotation request',
    paragraphs: [
      `${input.name} sent a request through your Tibay profile.`,
      `Contact: ${input.contact}`,
      `Message:\n${input.message}`,
      'Reply to them directly using the contact details above. This request is also saved in your Tibay inbox.',
    ],
    action: { label: 'Open my inbox', url: `${getEnv().PUBLIC_SITE_URL}/inbox` },
  });
  if (sent) await db.update(inquiries).set({ emailSent: true }).where(eq(inquiries.id, id));
  return { ok: true };
});
