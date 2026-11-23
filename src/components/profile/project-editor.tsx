'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, isUpgradeError } from '@/lib/api-client';
import { compressImage } from '@/lib/image-compress';
import { Button } from '../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';
import { promptUpgrade } from '../upgrade-prompt';

type Photo = { id: string; url: string };
export type EditableProject = { id: string; title: string; description: string; location: string; year: number | null; photos: Photo[] };

type Props = { project?: EditableProject; canAddProject?: boolean; /** Photos allowed in one project on the owner's plan. */ photoLimit: number };

/** Create or edit a portfolio project, including adding, ordering and removing its photos. */
export function ProjectEditor({ project, canAddProject = true, photoLimit }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<EditableProject | undefined>(project);
  const [fields, setFields] = useState({ title: project?.title ?? '', description: project?.description ?? '', location: project?.location ?? '', year: project?.year ? String(project.year) : '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [ordering, setOrdering] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remaining = Math.max(0, photoLimit - (current?.photos.length ?? 0));

  const reset = () => {
    setCurrent(project);
    setFields({ title: project?.title ?? '', description: project?.description ?? '', location: project?.location ?? '', year: project?.year ? String(project.year) : '' });
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
        const created = await api<{ id: string }>('/api/projects', { method: 'POST', body, upgradeReason: 'projects' });
        setCurrent({ id: created.id, ...body, photos: [] });
        toast.success('Project created — now add photos');
      }
      router.refresh();
    } catch (err) {
      if (isUpgradeError(err)) setOpen(false);
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function addPhotos(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!current || !files.length) return;
    if (remaining <= 0) return promptUpgrade('photos');
    const batch = files.slice(0, remaining);
    const skipped = files.length - batch.length;
    setUploading(batch.length);
    let hitPlanLimit = false;
    // Sequential uploads: gentle on mobile data and on the Worker's request quota.
    for (const file of batch) {
      try {
        const blob = await compressImage(file);
        const photo = await api<Photo>(`/api/projects/${current.id}/photos`, { method: 'POST', raw: blob, upgradeReason: 'photos' });
        setCurrent((c) => (c ? { ...c, photos: [...c.photos, photo] } : c));
      } catch (err) {
        if (isUpgradeError(err)) {
          hitPlanLimit = true;
          break;
        }
        toast.error(errorMessage(err));
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    setUploading(0);
    // Some photos did not fit: offer more room at the moment it matters.
    if (skipped > 0 && !hitPlanLimit) {
      toast.info(`${skipped} photo${skipped === 1 ? ' was' : 's were'} not added — this project holds ${photoLimit}.`);
      promptUpgrade('photos');
    }
    router.refresh();
  }

  /** Persists a new order. The first photo is the cover shown on the profile. */
  async function reorder(next: Photo[]) {
    if (!current) return;
    const previous = current.photos;
    setCurrent({ ...current, photos: next }); // optimistic
    setOrdering(true);
    try {
      await api(`/api/projects/${current.id}/photos/order`, { method: 'PUT', body: { photoIds: next.map((p) => p.id) } });
      router.refresh();
    } catch (err) {
      setCurrent((c) => (c ? { ...c, photos: previous } : c));
      toast.error(errorMessage(err));
    } finally {
      setOrdering(false);
    }
  }
  const move = (index: number, delta: -1 | 1) => {
    if (!current) return;
    const next = [...current.photos];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void reorder(next);
  };
  const makeCover = (index: number) => {
    if (!current || index === 0) return;
    const next = [...current.photos];
    const [photo] = next.splice(index, 1);
    void reorder([photo!, ...next]);
  };

  async function removePhoto(id: string) {
    try {
      await api(`/api/photos/${id}`, { method: 'DELETE' });
      setCurrent((c) => (c ? { ...c, photos: c.photos.filter((p) => p.id !== id) } : c));
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

  // At the project limit, "Add project" opens the upgrade prompt instead of a form that would fail on save.
  if (!project && !canAddProject)
    return (
      <Button variant="outline" size="sm" onClick={() => promptUpgrade('projects')}>
        <Plus aria-hidden /> Add project
      </Button>
    );

  const trigger = project ? (
    <Button variant="outline" size="sm" aria-label={`Edit project ${project.title}`}>
      <Pencil aria-hidden /> Edit
    </Button>
  ) : (
    <Button variant="outline" size="sm">
      <Plus aria-hidden /> Add project
    </Button>
  );
  const iconButton = 'flex size-8 items-center justify-center rounded-md bg-background/95 shadow-card hover:bg-muted disabled:opacity-40';

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
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">Photos</p>
                  <p className="text-xs text-muted-foreground">The first photo is the cover. Use the arrows to reorder.</p>
                </div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy={ordering}>
                  {current.photos.map((photo, index) => (
                    <li key={photo.id} className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt={`Photo ${index + 1}`} className="size-full object-cover" loading="lazy" />
                      {index === 0 ? (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                          <Star className="size-3 fill-current" aria-hidden /> Cover
                        </span>
                      ) : (
                        <button type="button" disabled={ordering} onClick={() => makeCover(index)} className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-background/95 px-2 py-1 text-[11px] font-medium shadow-card hover:bg-muted disabled:opacity-40" aria-label={`Make photo ${index + 1} the cover`}>
                          <Star className="size-3" aria-hidden /> Make cover
                        </button>
                      )}
                      <button type="button" onClick={() => void removePhoto(photo.id)} className={`${iconButton} absolute right-1.5 top-1.5 text-destructive`} aria-label={`Remove photo ${index + 1}`}>
                        <Trash2 className="size-3.5" />
                      </button>
                      <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                        <button type="button" disabled={ordering || index === 0} onClick={() => move(index, -1)} className={iconButton} aria-label={`Move photo ${index + 1} earlier`}>
                          <ChevronLeft className="size-4" />
                        </button>
                        <button type="button" disabled={ordering || index === current.photos.length - 1} onClick={() => move(index, 1)} className={iconButton} aria-label={`Move photo ${index + 1} later`}>
                          <ChevronRight className="size-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                  <li>
                    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={addPhotos} />
                    <button
                      type="button"
                      disabled={uploading > 0}
                      onClick={() => (remaining <= 0 ? promptUpgrade('photos') : fileInput.current?.click())}
                      className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:border-foreground/40 hover:bg-muted"
                    >
                      {uploading > 0 ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                      {uploading > 0 ? `Uploading ${uploading}…` : 'Add photos'}
                    </button>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  {current.photos.length} of {photoLimit} photos in this project. Photos are compressed automatically.
                  {remaining === 0 && (
                    <>
                      {' '}
                      <button type="button" className="font-medium text-accent underline-offset-4 hover:underline" onClick={() => promptUpgrade('photos')}>
                        Add more photos per project
                      </button>
                    </>
                  )}
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
