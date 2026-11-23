import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/prose';

export const metadata: Metadata = { title: 'About', description: 'Tibay helps Filipino construction professionals build an online presence and win more projects.', alternates: { canonical: '/about' } };

export default function AboutPage() {
  return (
    <Prose title="About Tibay">
      <p>
        <strong>Tibay</strong> means strength and durability — the qualities every good builder is proud of. We built Tibay because most Filipino contractors, engineers, architects and skilled workers win
        projects through word of mouth, yet have no simple, affordable way to show their work online.
      </p>
      <h2>What Tibay does</h2>
      <ul>
        <li>Gives every professional a clean public profile with a project portfolio and a shareable link and QR code.</li>
        <li>Lets clients browse a directory by profession, specialization and location, and contact professionals without signing up.</li>
        <li>Includes a quotation maker that produces professional PDF quotations in minutes.</li>
      </ul>
      <h2>What Tibay is not</h2>
      <p>Tibay is not a bidding site or a payment middleman. Clients and professionals deal with each other directly. We never take a commission on your projects.</p>
      <p>
        Questions or suggestions? <Link href="/contact">Get in touch</Link>.
      </p>
    </Prose>
  );
}
