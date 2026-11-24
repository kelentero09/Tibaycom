import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from './db';

const API = 'https://api.paymongo.com/v1';

export type PaymongoPayment = {
  id: string;
  attributes: {
    amount: number;
    currency: string;
    status: string;
    fee?: number;
    net_amount?: number;
    paid_at?: number | null;
    livemode?: boolean;
    source?: { type?: string };
    metadata?: Record<string, string> | null;
    refunds?: { attributes?: { amount?: number; status?: string } }[];
    last_payment_error?: { message?: string } | null;
  };
};

export type PaymongoCheckoutSession = {
  id: string;
  attributes: {
    checkout_url: string;
    livemode: boolean;
    reference_number?: string | null;
    metadata?: Record<string, string> | null;
    payments?: PaymongoPayment[];
    status?: string;
  };
};

export type PaymongoEvent = {
  id: string;
  attributes: { type: string; livemode: boolean; data: { id: string; type: string; attributes: Record<string, unknown> } };
};

export class PaymongoError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** True when no PayMongo key is configured outside production: checkout is simulated locally. */
export const isMockMode = () => {
  const env = getEnv();
  return !env.PAYMONGO_SECRET_KEY && env.APP_ENV !== 'production';
};
export const isLiveKey = () => (getEnv().PAYMONGO_SECRET_KEY ?? '').startsWith('sk_live_');

async function request<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string }): Promise<T> {
  const key = getEnv().PAYMONGO_SECRET_KEY;
  if (!key) throw new PaymongoError('PayMongo is not configured.', 503);
  const response = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: `Basic ${btoa(`${key}:`)}`,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as { data?: T; errors?: { detail?: string }[] } | null;
  if (!response.ok || !payload?.data) throw new PaymongoError(payload?.errors?.[0]?.detail ?? `PayMongo request failed (${response.status})`, response.status);
  return payload.data;
}

type CheckoutInput = {
  amount: number;
  name: string;
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  email: string;
  customerName: string;
  metadata: Record<string, string>;
};

export function createCheckoutSession(input: CheckoutInput) {
  return request<PaymongoCheckoutSession>('/checkout_sessions', {
    method: 'POST',
    // The same key always returns the same session — a retried request can never create a second charge.
    idempotencyKey: input.referenceNumber,
    body: {
      data: {
        attributes: {
          line_items: [{ amount: input.amount, currency: 'PHP', name: input.name, quantity: 1, description: input.description }],
          payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay', 'qrph'],
          description: input.description,
          reference_number: input.referenceNumber,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          billing: { email: input.email, name: input.customerName },
          metadata: input.metadata,
        },
      },
    },
  });
}

export const retrieveCheckoutSession = (id: string) => request<PaymongoCheckoutSession>(`/checkout_sessions/${encodeURIComponent(id)}`, { method: 'GET' });

export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verifies the `Paymongo-Signature` header: `t=<unix>,te=<test signature>,li=<live signature>`.
 * The signature is HMAC-SHA256(`${t}.${rawBody}`) keyed with the webhook secret; `li` is used for live events, `te` for test.
 * Rejects stale timestamps to stop replayed deliveries.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, options: { live: boolean; now?: number }): boolean {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(',').map((part) => {
      const index = part.indexOf('=');
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }),
  );
  const timestamp = parts.get('t');
  const provided = parts.get(options.live ? 'li' : 'te');
  if (!timestamp || !provided || !/^\d+$/.test(timestamp) || !/^[0-9a-f]+$/i.test(provided)) return false;
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (Math.abs(now - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest();
  const given = Buffer.from(provided, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Used by tests and the local simulator: produces a header the verifier accepts. */
export function signWebhookPayload(rawBody: string, secret: string, options: { live: boolean; timestamp?: number }) {
  const t = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return options.live ? `t=${t},te=,li=${signature}` : `t=${t},te=${signature},li=`;
}
