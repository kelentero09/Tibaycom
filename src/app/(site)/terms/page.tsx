import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Terms of Service', alternates: { canonical: '/terms' } };

// NOTE: Template. Have it reviewed by counsel and fill in the operator's legal name and address before launch.
export default function TermsPage() {
  return (
    <Prose title="Terms of Service" updated="November 2026">
      <p>By creating an account or using Tibay you agree to these terms. If you do not agree, please do not use the service.</p>
      <h2>The service</h2>
      <p>Tibay provides public profile pages, a directory of construction professionals and a quotation tool. Tibay is not a party to any agreement between professionals and their clients, does not verify licences or workmanship, and does not handle project payments.</p>
      <h2>Your account</h2>
      <ul>
        <li>You must provide accurate information and keep your password confidential.</li>
        <li>One person or business may hold one profile. You are responsible for activity on your account.</li>
      </ul>
      <h2>Your content</h2>
      <ul>
        <li>You keep ownership of the photos and text you upload and give Tibay permission to display them as part of the service.</li>
        <li>Only upload content you have the right to use. Do not post photos of projects that are not yours.</li>
        <li>No false claims about licences or credentials, no unlawful, hateful, sexual or misleading content, and no spam.</li>
      </ul>
      <p>We may remove content or suspend accounts that break these rules or that are reported and found to be misleading.</p>
      <h2>For clients</h2>
      <p>Profiles are created by the professionals themselves. Always verify licences, permits, references and contracts independently before hiring or paying anyone. Tibay is not liable for the quality of work, delays, or losses arising from dealings between users.</p>
      <h2>Subscriptions and payments</h2>
      <ul>
        <li>Premium is prepaid for a fixed period (one month or one year) and is not renewed or charged automatically.</li>
        <li>Prices are in Philippine pesos and are shown on the <Link href="/pricing">pricing page</Link>. We may change prices for future periods.</li>
        <li>When a paid period ends without renewal the account returns to the Free plan; content above the Free limits is hidden, not deleted.</li>
        <li>Refund requests are handled case by case within 7 days of payment.</li>
      </ul>
      <h2>Quotation tool</h2>
      <p>Quotations are generated from the figures you enter. You are responsible for checking every amount, tax treatment and term before sending a quotation to a client.</p>
      <h2>Liability</h2>
      <p>Tibay is provided “as is”. To the extent permitted by Philippine law, our total liability is limited to the amount you paid us in the three months before the claim.</p>
      <h2>Changes and governing law</h2>
      <p>We may update these terms and will post the new date above. These terms are governed by the laws of the Republic of the Philippines.</p>
    </Prose>
  );
}
