import { contactFormSchema } from '@/lib/validation';
import { getEnv } from '@/server/db';
import { sendEmail } from '@/server/email';
import { ApiError, parseBody, route, verifyTurnstile } from '@/server/http';

/** Public "contact Tibay" form → support inbox. */
export const POST = route({ access: 'public', limit: { name: 'contact', max: 3, windowSeconds: 3600 } }, async ({ request, ip }) => {
  const input = await parseBody(request, contactFormSchema);
  await verifyTurnstile(input.turnstileToken, ip);
  const env = getEnv();
  const sent = await sendEmail({
    to: env.SUPPORT_EMAIL,
    replyTo: input.email,
    subject: `Contact form: ${input.name}`,
    heading: 'New contact form message',
    paragraphs: [`From: ${input.name} <${input.email}>`, input.message],
  });
  if (!sent && env.APP_ENV === 'production') throw new ApiError(502, 'We could not send your message. Please try again later.');
  return { ok: true };
});
