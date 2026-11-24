'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, isUpgradeError } from '@/lib/api-client';
import { POST_KIND_LABELS, POST_KIND_VALUES, type Intent, type PostKind } from '@/lib/community';
import { compressImage } from '@/lib/image-compress';
import { PHOTOS_PER_POST } from '@/lib/plans';
import { Button } from '../ui/button';
import { Field, Select, Textarea } from '../ui/form';
import { Avatar } from './post-card';

type Props = {
  author: { businessName: string; avatarUrl: string | null; intent: Intent };
  projects: { id: string; title: string }[];
  /** e.g. "2 of 3 posts left today"; null for unlimited. */
  quotaNote: string | null;
};

/** Sensible default post type for each kind of member. */
const DEFAULT_KIND: Record<Intent, PostKind> = { seeking_clients: 'showcase', hiring: 'hiring', seeking_work: 'looking_for_work', seeking_contractor: 'looking_for_contractor' };
const PLACEHOLDER: Record<PostKind, string> = {
  update: 'Share an update from site, a tip, or a question for other builders…',
  showcase: 'Show a finished job: what you built, where, and what makes it good…',
  looking_for_work: 'Your trade, years of experience, where you can work and when you are available…',
  hiring: 'Who you need (e.g. 3 masons), where, for how long, and how to reach you…',
  looking_for_contractor: 'What you want to build or renovate, where, and your rough budget and timeline…',
};

export function PostComposer({ author, projects, quotaNote }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PostKind>(DEFAULT_KIND[author.intent]);
  const [body, setBody] = useState('');
  const [projectId, setProjectId] = useState('');
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);

  // Release object URLs on unmount.
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  function addFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    const room = PHOTOS_PER_POST - files.length;
    if (picked.length > room) toast.info(`A post can have up to ${PHOTOS_PER_POST} photos.`);
    setFiles((current) => [...current, ...picked.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  function removeFile(index: number) {
    setFiles((current) => {
      URL.revokeObjectURL(current[index]!.preview);
      return current.filter((_, i) => i !== index);
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (body.trim().length < 2) return void toast.error('Write something first.');
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/api/posts', { method: 'POST', body: { kind, body, projectId: projectId || null }, upgradeReason: 'posts' });
      let failedPhotos = 0;
      for (const { file } of files) {
        try {
          await api(`/api/posts/${id}/photos`, { method: 'POST', raw: await compressImage(file) });
        } catch {
          failedPhotos += 1;
        }
      }
      if (failedPhotos) toast.warning(`Posted, but ${failedPhotos} photo${failedPhotos === 1 ? '' : 's'} could not be uploaded.`);
      else toast.success('Posted to the community');
      files.forEach((f) => URL.revokeObjectURL(f.preview));
      setFiles([]);
      setBody('');
      setProjectId('');
      router.refresh();
    } catch (err) {
      if (!isUpgradeError(err)) toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-background p-4 shadow-card sm:p-5" aria-label="Create a post">
      <div className="flex items-start gap-3">
        <Avatar url={author.avatarUrl} name={author.businessName} />
        <div className="grid flex-1 gap-3">
          <label htmlFor="composer-body" className="sr-only">
            Post
          </label>
          <Textarea id="composer-body" rows={3} maxLength={2000} value={body} placeholder={PLACEHOLDER[kind]} onChange={(e) => setBody(e.target.value)} className="min-h-24" />
          {files.length > 0 && (
            <ul className="grid grid-cols-4 gap-2">
              {files.map((f, i) => (
                <li key={f.preview} className="relative aspect-square overflow-hidden rounded-md bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.preview} alt={`Selected photo ${i + 1}`} className="size-full object-cover" />
                  <button type="button" onClick={() => removeFile(i)} className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background/90 shadow" aria-label={`Remove photo ${i + 1}`}>
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type of post" htmlFor="composer-kind">
              <Select id="composer-kind" value={kind} onChange={(e) => setKind(e.target.value as PostKind)}>
                {POST_KIND_VALUES.map((k) => (
                  <option key={k} value={k}>
                    {POST_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </Field>
            {projects.length > 0 && (
              <Field label="Link a project (optional)" htmlFor="composer-project">
                <Select id="composer-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <div className="flex items-center gap-3">
          <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={addFiles} />
          <Button type="button" variant="ghost" size="sm" disabled={files.length >= PHOTOS_PER_POST} onClick={() => fileInput.current?.click()}>
            <ImagePlus aria-hidden /> Photos ({files.length}/{PHOTOS_PER_POST})
          </Button>
          {quotaNote && <span className="text-xs text-muted-foreground">{quotaNote}</span>}
        </div>
        <Button type="submit" loading={busy}>
          Post
        </Button>
      </div>
    </form>
  );
}
