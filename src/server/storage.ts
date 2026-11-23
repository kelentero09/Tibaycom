import 'server-only';
import { IMAGE_RULES } from '@/lib/plans';
import { getEnv } from './db';
import { ApiError } from './http';

export type ImageKind = 'avatar' | 'logo' | 'cover' | 'project';
type Sniffed = { type: 'image/webp' | 'image/jpeg' | 'image/png'; ext: 'webp' | 'jpg' | 'png' };

/** Detects the real format from magic bytes — the client-supplied MIME type and filename are never trusted. */
export function sniffImage(bytes: Uint8Array): Sniffed | null {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a)
    return { type: 'image/png', ext: 'png' };
  const ascii = (start: number, text: string) => [...text].every((c, i) => at(start + i) === c.charCodeAt(0));
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return { type: 'image/webp', ext: 'webp' };
  return null;
}

export function validateImage(bytes: Uint8Array): Sniffed {
  if (bytes.byteLength === 0) throw new ApiError(400, 'The file is empty.');
  if (bytes.byteLength > IMAGE_RULES.maxBytes) throw new ApiError(413, 'Image is too large. Maximum size is 1.5 MB after compression.');
  const sniffed = sniffImage(bytes);
  if (!sniffed) throw new ApiError(415, 'Only JPEG, PNG or WebP images are allowed.');
  return sniffed;
}

/** Stores a validated image under a server-generated key. Returns the key. */
export async function putImage(userId: string, kind: ImageKind, bytes: Uint8Array): Promise<string> {
  const { type, ext } = validateImage(bytes);
  const key = `${kind}/${userId}/${crypto.randomUUID()}.${ext}`;
  await getEnv().BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  return key;
}

export async function deleteImages(keys: (string | null | undefined)[]) {
  const list = keys.filter((k): k is string => !!k);
  if (list.length) await getEnv().BUCKET.delete(list);
}

export const IMAGE_KEY_PATTERN = /^(avatar|logo|cover|project)\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(webp|jpg|png)$/;
export const imageUrl = (key: string | null | undefined) => (key ? `/img/${key}` : null);

/** Reads a raw image request body with a hard size cap. */
export async function readImageBody(request: Request): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > IMAGE_RULES.maxBytes) throw new ApiError(413, 'Image is too large.');
  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.byteLength > IMAGE_RULES.maxBytes) throw new ApiError(413, 'Image is too large.');
  return buffer;
}

/** Removes every image a user owns (keys are namespaced by user id). Used on account deletion. */
export async function deleteUserImages(userId: string) {
  const bucket = getEnv().BUCKET;
  for (const kind of ['avatar', 'logo', 'cover', 'project']) {
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix: `${kind}/${userId}/`, cursor });
      if (page.objects.length) await bucket.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
}
