import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, PageHeader } from '@/components/ui/misc';
import { getSystemHealth } from '@/server/admin/queries';
import { requireAdmin } from '@/server/auth';
import { getEnv } from '@/server/db';
import { isLiveKey, isMockMode } from '@/server/paymongo';

export const metadata = { title: 'System' };

// Cloudflare free-tier allowances used as reference points (verify current limits in the Cloudflare dashboard).
const FREE_TIER = { d1Bytes: 5 * 1024 ** 3, r2Bytes: 10 * 1024 ** 3 };

const bytes = (value: number) => (value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`);
const when = (value: unknown) => (value ? new Date(Number(value)).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

const isRecent = (timestamp: number, hours: number) => Date.now() - timestamp < hours * 3600_000;

const providers = [
  { name: 'Cloudflare dashboard', detail: 'Workers requests, D1 reads/writes, R2 storage and operations', href: 'https://dash.cloudflare.com/' },
  { name: 'PayMongo dashboard', detail: 'Payments, refunds, payouts and webhooks', href: 'https://dashboard.paymongo.com/' },
  { name: 'Resend dashboard', detail: 'Email delivery, bounces and daily quota', href: 'https://resend.com/emails' },
  { name: 'Turnstile analytics', detail: 'Challenge solve rates', href: 'https://dash.cloudflare.com/?to=/:account/turnstile' },
];

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = Math.min(1, used / limit);
  const tone = ratio >= 0.9 ? 'bg-destructive' : ratio >= 0.7 ? 'bg-warning' : 'bg-success';
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {bytes(used)} of {bytes(limit)} ({(ratio * 100).toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(1, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export default async function AdminSystemPage() {
  await requireAdmin();
  const env = getEnv();
  const { dbLatencyMs, counts } = await getSystemHealth();
  const n = (key: string) => Number(counts[key] ?? 0);
  const checks = [
    { label: 'Database (D1)', ok: true, detail: `Responded in ${dbLatencyMs} ms` },
    { label: 'Environment', ok: true, detail: env.APP_ENV },
    { label: 'PayMongo', ok: !isMockMode(), detail: isMockMode() ? 'Not configured — local simulator in use' : isLiveKey() ? 'LIVE keys' : 'Test keys' },
    { label: 'Webhook secret', ok: !!env.PAYMONGO_WEBHOOK_SECRET, detail: env.PAYMONGO_WEBHOOK_SECRET ? `Last event: ${when(counts.lastWebhook)}` : 'Missing' },
    { label: 'Email (Resend)', ok: !!env.RESEND_API_KEY, detail: env.RESEND_API_KEY ? 'Configured' : 'Not configured — emails are only logged' },
    { label: 'Daily maintenance', ok: !!counts.lastMaintenance && isRecent(n('lastMaintenance'), 36), detail: `Last run: ${when(counts.lastMaintenance)}` },
  ];
  const rows: [string, number][] = [
    ['Users', n('users')], ['Profiles', n('profiles')], ['Projects', n('projects')], ['Photos', n('photos')],
    ['Quotations', n('quotations')], ['Payments', n('payments')], ['Active sessions', n('sessions')], ['Audit log entries', n('auditLogs')],
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="System health" description="Configuration checks and storage usage against Cloudflare’s free tier." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Checks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {checks.map((check) => (
                <li key={check.label} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">{check.label}</span>
                    <span className="block text-xs text-muted-foreground">{check.detail}</span>
                  </span>
                  <Badge variant={check.ok ? 'success' : 'warning'}>{check.ok ? 'OK' : 'Attention'}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <CardDescription>Request and operation quotas reset daily — see the Cloudflare dashboard for those.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Meter label="D1 database size" used={n('dbBytes')} limit={FREE_TIER.d1Bytes} />
            <Meter label="R2 portfolio photos (tracked)" used={n('photoBytes')} limit={FREE_TIER.r2Bytes} />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{value.toLocaleString('en-PH')}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Provider dashboards</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <li key={provider.name}>
                <a href={provider.href} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm hover:border-foreground/30">
                  <span>
                    <span className="font-medium">{provider.name}</span>
                    <span className="block text-xs text-muted-foreground">{provider.detail}</span>
                  </span>
                  <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
