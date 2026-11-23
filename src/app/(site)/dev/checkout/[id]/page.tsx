import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { MockCheckout } from '@/components/account/subscription-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/misc';
import { requireUser } from '@/server/auth';
import { getDb, schema } from '@/server/db';
import { isMockMode } from '@/server/paymongo';

export const metadata = { title: 'Payment simulator', robots: { index: false } };

/** Stand-in for PayMongo's hosted checkout. Only reachable when no PayMongo key is set outside production. */
export default async function MockCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isMockMode()) notFound();
  const user = await requireUser();
  const { id } = await params;
  const payment = await getDb().select().from(schema.payments).where(and(eq(schema.payments.id, id), eq(schema.payments.userId, user.id))).get();
  if (!payment) notFound();
  return (
    <div className="container-page flex justify-center py-12">
      <Card className="w-full max-w-sm">
        <CardContent className="grid gap-4">
          <Alert variant="warning">Development payment simulator — no real money moves. Configure PayMongo test keys to use the real checkout.</Alert>
          <p className="text-sm text-muted-foreground">Tibay Premium — {payment.interval === 'annual' ? '1 year' : '1 month'}</p>
          <MockCheckout paymentId={payment.id} amount={payment.amount} />
        </CardContent>
      </Card>
    </div>
  );
}
