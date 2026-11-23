'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError, errorMessage } from '@/lib/api-client';
import { compressImage } from '@/lib/image-compress';
import { IMAGE_RULES } from '@/lib/plans';
import { Button } from '../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';

export type EditableProject = { id: string; title: string; description: string; location: string; year: number | null; photos: { id: string; url: string }[] };

type Props = { project?: EditableProject; canAddProject?: boolean; photosRemaining: number };

/** Create or edit a portfolio project, including its photos. Used from the owner's own profile page. */
export function ProjectEditor({ project, canAddProject = true, photosRemaining }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<EditableProject | undefined>(project);
  const [fields, setFields] = useState({ title: project?.title ?? '', description: project?.description ?? '', location: project?.location ?? '', year: project?.year ? String(project.year) : '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [remaining, setRemaining] = useState(photosRemaining);

  const reset = () => {
    setCurrent(project);
    setFields({ title: project?.title ?? '', description: project?.description ?? '', location: project?.location ?? '', year: project?.year ? String(project.year) : '' });
    setRemaining(photosRemaining);
    setError(null);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = { ...fields, year: fields.year ? Number(fields.year) : null };
    try {
      if (current) {
        await api(`/api/projects/${current.id}`, { method: 'PATCH', body });
        toast.success('Project saved');
        setOpen(false);
      } else {
        const created = await api<{ id: string }>('/api/projects', { method: 'POST', body });
        setCurrent({ id: created.id, ...body, photos: [] });
        toast.success('Project created — now add photos');
      }
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!current || !files.length) return;
    const room = Math.min(remaining, IMAGE_RULES.maxPhotosPerProject - current.photos.length);
    if (files.length > room) toast.info(room > 0 ? `Only ${room} more photo${room === 1 ? '' : 's'} can be added.` : 'Photo limit reached.');
    const batch = files.slice(0, Math.max(0, room));
    setUploading(batch.length);
    // Sequential uploads: gentle on mobile data and on the Worker's request quota.
    for (const file of batch) {
      try {
        const blob = await compressImage(file);
        const photo = await api<{ id: string; url: string }>(`/api/projects/${current.id}/photos`, { method: 'POST', raw: blob });
        setCurrent((c) => (c ? { ...c, photos: [...c.photos, photo] } : c));
        setRemaining((r) => r - 1);
      } catch (err) {
        toast.error(errorMessage(err));
        if (err instanceof ApiClientError && err.code === 'limit_reached') break;
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setUploading(0);
    router.refresh();
  }

  async function removePhoto(id: string) {
    try {
      await api(`/api/photos/${id}`, { method: 'DELETE' });
      setCurrent((c) => (c ? { ...c, photos: c.photos.filter((p) => p.id !== id) } : c));
      setRemaining((r) => r + 1);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function removeProject() {
    if (!current) return;
    setDeleting(true);
    try {
      await api(`/api/projects/${current.id}`, { method: 'DELETE' });
      toast.success('Project deleted');
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const trigger = project ? (
    <Button variant="outline" size="sm" aria-label={`Edit project ${project.title}`}>
      <Pencil aria-hidden /> Edit
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Plus aria-hidden /> Add project
    </Button>
  );

  if (!project && !canAddProject)
    return (
      <Button variant="outline" size="sm" onClick={() => toast.info('You have reached your plan’s project limit.', { action: { label: 'Upgrade', onClick: () => window.location.assign('/pricing') } })}>
        <Plus aria-hidden /> Add project
      </Button>
    );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) reset();
        }}
      >
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent title={current ? 'Edit project' : 'Add project'} className="sm:max-w-xl">
          <form onSubmit={save} className="grid gap-4" noValidate>
            {error && <Alert variant="destructive">{error}</Alert>}
            <Field label="Project title" htmlFor="pj-title" required>
              <Input id="pj-title" value={fields.title} maxLength={100} placeholder="Two-storey residence, Quezon City" onChange={(e) => setFields({ ...fields, title: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="pj-desc">
              <Textarea id="pj-desc" rows={4} value={fields.description} maxLength={1500} onChange={(e) => setFields({ ...fields, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_7rem] gap-4">
              <Field label="Location" htmlFor="pj-loc">
                <Input id="pj-loc" value={fields.location} maxLength={100} onChange={(e) => setFields({ ...fields, location: e.target.value })} />
              </Field>
              <Field label="Year" htmlFor="pj-year">
                <Input id="pj-year" type="number" inputMode="numeric" min={1950} max={new Date().getFullYear() + 1} value={fields.year} onChange={(e) => setFields({ ...fields, year: e.target.value })} />
              </Field>
            </div>

            {current && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">Photos</p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {current.photos.map((photo) => (
                    <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
                      <button type="button" onClick={() => void removePhoto(photo.id)} className="absolute right-1 top-1 rounded-full bg-background/95 p-1.5 text-destructive shadow-sm" aria-label="Remove photo">
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                  <li>
                    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={addPhotos} />
                    <button type="button" disabled={uploading > 0} onClick={() => fileInput.current?.click()} className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted">
                      {uploading > 0 ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                      {uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}
                    </button>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  {remaining} photo{remaining === 1 ? '' : 's'} left on your plan. Photos are compressed automatically.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t pt-4">
              {current ? (
                <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {current ? 'Done' : 'Cancel'}
                </Button>
                <Button type="submit" loading={saving}>
                  {current ? 'Save' : 'Create & add photos'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this project?" description="The project and all of its photos will be permanently removed from your profile." confirmLabel="Delete project" loading={deleting} onConfirm={removeProject} />
    </>
  );
}
