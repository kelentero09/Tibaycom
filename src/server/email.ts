import 'server-only';
import { getEnv } from './db';

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

type Email = { to: string; subject: string; heading: string; paragraphs: string[]; action?: { label: string; url: string }; replyTo?: string };

function render({ heading, paragraphs, action }: Email): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#0f172a;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(action.url)}</p>`
    : '';
  return `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${button}<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"><p style="font-size:12px;color:#64748b;margin:0">Tibay — the online home of Filipino builders.</p></div>`;
}

/** Sends through Resend's HTTP API. Without an API key (local dev) the email is logged instead. */
export async function sendEmail(email: Email): Promise<boolean> {
  const env = getEnv();
  if (!env.RESEND_API_KEY) {
    if (env.APP_ENV !== 'production') console.log(`[email:dev] to=${email.to} subject="${email.subject}"`, email.action?.url ?? '', '\n', email.paragraphs.join('\n'));
    else console.error('[email] RESEND_API_KEY is not configured; email dropped');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email.to],
      subject: email.subject,
      html: render(email),
      text: [email.heading, ...email.paragraphs, email.action ? `${email.action.label}: ${email.action.url}` : ''].join('\n\n'),
      reply_to: email.replyTo,
    }),
  });
  if (!res.ok) console.error('[email] Resend rejected the message', res.status);
  return res.ok;
}
