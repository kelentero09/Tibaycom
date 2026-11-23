export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  raw?: Blob;
  /**
   * When the server answers "plan limit reached" (HTTP 402), open the upgrade dialog with this reason —
   * the prompt appears at the exact moment the user needs more. Pass `false` to handle it yourself.
   */
  upgradeReason?: string | false;
};

/** Thin JSON fetch wrapper for the app's own API. Throws ApiClientError with a user-presentable message. */
export async function api<T = { ok: true }>(path: string, { method = 'GET', body, raw, upgradeReason = 'generic' }: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: raw ? { 'content-type': raw.type || 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiClientError('Network error. Check your connection and try again.', 0);
  }
  const data = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
  if (!response.ok) {
    if (response.status === 402 && upgradeReason !== false && typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('tibay:upgrade', { detail: upgradeReason }));
    throw new ApiClientError(data?.error ?? 'Something went wrong. Please try again.', response.status, data?.code);
  }
  return data as T;
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
/** True for plan-limit errors, which are presented by the upgrade dialog rather than an error toast. */
export const isUpgradeError = (error: unknown) => error instanceof ApiClientError && error.status === 402;
