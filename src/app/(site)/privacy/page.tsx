import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'Privacy Policy', alternates: { canonical: '/privacy' } };

// NOTE: Template prepared with the Data Privacy Act of 2012 (RA 10173) in mind. Have it reviewed by counsel and
// fill in the operator's legal name, address and Data Protection Officer before launch.
export default function PrivacyPage() {
  return (
    <Prose title="Privacy Policy" updated="November 2026">
      <p>
        This policy explains how Tibay (“we”, “us”) collects, uses and protects personal data in accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), its Implementing Rules and
        Regulations, and issuances of the National Privacy Commission (NPC).
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account data:</strong> name, email address and a securely hashed password.</li>
        <li><strong>Profile data you choose to publish:</strong> business name, profession, location, description, services, contact number, social links, photos and projects.</li>
        <li><strong>Quotation data:</strong> the client names, contact details and line items you enter when creating quotations. You are responsible for having a lawful basis to record your clients’ details.</li>
        <li><strong>Payment data:</strong> subscription payments are processed by PayMongo. We receive the payment status, amount and reference numbers. We never receive or store card numbers or e-wallet credentials.</li>
        <li><strong>Technical data:</strong> IP address and browser information, used for security, rate limiting and fraud prevention.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To provide your account, public profile, directory listing and quotations (performance of our contract with you).</li>
        <li>To process subscriptions and send service emails such as verification, password reset and renewal reminders.</li>
        <li>To keep the platform secure, prevent abuse and comply with legal obligations.</li>
      </ul>
      <p>We do not sell personal data and we do not use it for third-party advertising.</p>
      <h2>Messages sent to professionals</h2>
      <p>When a visitor sends a quotation request through a profile, the name, contact details and message are emailed to that professional only. Tibay does not keep a copy of the message.</p>
      <h2>Service providers</h2>
      <p>We share data only with processors that help us run Tibay: Cloudflare (hosting, database, storage and bot protection), PayMongo (payments) and Resend (email delivery). Some of these process data outside the Philippines under appropriate safeguards.</p>
      <h2>Retention</h2>
      <p>We keep account and profile data while your account is active. When you delete your account, your profile, projects, photos and quotations are removed. Payment and audit records are retained as required by tax and accounting laws.</p>
      <h2>Your rights</h2>
      <p>Under the Data Privacy Act you have the right to be informed, to access, to object, to rectify, to erase or block, to data portability, to damages, and to file a complaint with the NPC. You can edit most data from your profile, delete your account from Account settings, or contact us to exercise any right.</p>
      <h2>Security</h2>
      <p>We use encryption in transit, hashed passwords, access controls, two-factor authentication for administrators and audit logging. No system is perfectly secure; we will notify affected users and the NPC of a qualifying breach within the periods required by law.</p>
      <h2>Cookies</h2>
      <p>Tibay uses only essential cookies that keep you signed in and protect forms from abuse. We do not use advertising or cross-site tracking cookies.</p>
      <h2>Contact</h2>
      <p>
        For privacy questions or requests, reach our Data Protection Officer through the <Link href="/contact">contact page</Link>.
      </p>
    </Prose>
  );
}
