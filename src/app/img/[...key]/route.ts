import { getEnv } from '@/server/db';
import { IMAGE_KEY_PATTERN } from '@/server/storage';

const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png']);

/** Serves public portfolio/profile images from the private R2 bucket. Keys are random and immutable. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/');
  if (!IMAGE_KEY_PATTERN.test(key)) return new Response('Not found', { status: 404 });

  const object = await getEnv().BUCKET.get(key, { onlyIf: request.headers });
  if (!object) return new Response('Not found', { status: 404 });

  const contentType = object.httpMetadata?.contentType ?? '';
  const headers = new Headers({
    'content-type': ALLOWED.has(contentType) ? contentType : 'application/octet-stream',
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
    etag: object.httpEtag,
  });
  if (!('body' in object)) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
