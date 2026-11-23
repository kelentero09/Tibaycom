import 'server-only';
import { redirect } from 'next/navigation';
import type { QuotationBranding, QuotationDocument } from '@/lib/quotation-pdf';
import { requireUser } from '@/server/auth';
import type { Entitlements } from '@/server/entitlements';
import { ApiError } from '@/server/http';
import { getProfileByUserId, type ProfileRow } from '@/server/profiles';
import { getQuotation, type QuotationRow } from '@/server/quotations';
import { imageUrl } from '@/server/storage';

/** Quotation pages need a signed-in user with a profile (it supplies the business header). */
export async function requireQuotationUser(returnTo: string) {
  const user = await requireUser(returnTo);
  const profile = await getProfileByUserId(user.id);
  if (!profile) redirect('/onboarding');
  return { user, profile };
}

/** Branding is decided on the server from the live entitlement — a Free client never receives the logo. */
export function brandingFor(profile: ProfileRow, entitlements: Entitlements, accountEmail: string): QuotationBranding {
  const branded = entitlements.limits.customQuotationBranding;
  return {
    businessName: profile.businessName,
    addressLine: [profile.city, profile.province].filter(Boolean).join(', '),
    phone: profile.phone,
    email: profile.contactEmail || accountEmail,
    logoUrl: branded ? imageUrl(profile.logoKey) : null,
    showPlatformFooter: !entitlements.limits.removePlatformBranding,
  };
}

/** Loads a quotation for a page; plan-locked history goes to the upgrade page, anything else is a 404. */
export async function loadQuotationOr404(userId: string, id: string) {
  try {
    return await getQuotation(userId, id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 402) redirect('/account/subscription?reason=history');
    return null;
  }
}

export const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/** The plain document shape shared by the on-screen view, the PDF and the client link. */
export function toDocument(row: QuotationRow): QuotationDocument {
  return {
    number: row.number,
    title: row.title,
    clientName: row.clientName,
    clientAddress: row.clientAddress,
    clientContact: row.clientContact,
    issueDate: row.issueDate,
    validUntil: row.validUntil,
    items: row.items,
    discountType: row.discountType,
    discountValue: row.discountValue,
    taxRateBps: row.taxRateBps,
    paymentTerms: row.paymentTerms,
    notes: row.notes,
  };
}
