'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage, isUpgradeError } from '@/lib/api-client';
import { Button } from '../ui/button';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from '../ui/dialog';
import { Field, Input, Textarea } from '../ui/form';
import { Alert } from '../ui/misc';
import { promptUpgrade } from '../upgrade-prompt';

export type EditableUpdate = { id: string; date: string; title: string; body: string; photoId: string | null };
type Photo = { id: string; url: string };

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

/** Add or edit one progress update on a project timeline. */
export function TimelineUpdateEditor({ projectId, update, photos, canAdd = true }: { projectId: string; update?: EditableUpdate; photos: Photo[]; canAdd?: boolean }) {
  const router = useRouter();
  const blank = { date: today(), title: '', body: '', photoId: null as string | null };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(update ?? blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const body = { date: form.date, title: form.title, body: form.body, photoId: form.photoId };
    try {
      if (update) await api(`/api/project-updates/${update.id}`, { method: 'PATCH', body });
      else await api(`/api/projects/${projectId}/updates`, { method: 'POST', body, upgradeReason: 'updates' });
      toast.success(update ? 'Update saved' : 'Update added to the timeline');
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (isUpgradeError(err)) setOpen(false);
      else setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!update) return;
    setDeleting(true);
    try {
      await api(`/api/project-updates/${update.id}`, { method: 'DELETE' });
      toast.success('Update deleted');
      setConfirmDelete(false);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  if (!update && !canAdd)
    return (
      <Button variant="outline" size="sm" onClick={() => promptUpgrade('updates')}>
        <Plus aria-hidden /> Add update
      </Button>
    );

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setForm(update ?? blank);
            setError(null);
          }
        }}
      >
        <DialogTrigger asChild>
          {update ? (
            <Button variant="ghost" size="sm" aria-label={`Edit update ${update.title}`}>
              <Pencil aria-hidden />
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Plus aria-hidden /> Add update
            </Button>
          )}
        </DialogTrigger>
        <DialogContent title={update ? 'Edit timeline update' : 'Add timeline update'} description="Show clients how the work progressed, step by step." className="sm:max-w-lg">
          <form onSubmit={save} className="grid gap-4" noValidate>
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field label="Date" htmlFor="tu-date" required>
                <Input id="tu-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Milestone" htmlFor="tu-title" required>
                <Input id="tu-title" value={form.title} maxLength={100} placeholder="Foundation poured" onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
            </div>
            <Field label="Details" htmlFor="tu-body">
              <Textarea id="tu-body" rows={4} value={form.body} maxLength={1500} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            {photos.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">Photo (optional)</legend>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  <button type="button" onClick={() => setForm({ ...form, photoId: null })} className={`flex aspect-square items-center justify-center rounded-md border text-xs text-muted-foreground ${form.photoId === null ? 'ring-2 ring-primary' : ''}`} aria-pressed={form.photoId === null}>
                    None
                  </button>
                  {photos.map((photo, i) => (
                    <button key={photo.id} type="button" onClick={() => setForm({ ...form, photoId: photo.id })} className={`aspect-square overflow-hidden rounded-md border ${form.photoId === photo.id ? 'ring-2 ring-primary' : ''}`} aria-pressed={form.photoId === photo.id} aria-label={`Use photo ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex items-center justify-between gap-2 border-t pt-4">
              {update ? (
                <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  {update ? 'Save' : 'Add to timeline'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {update && <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="Delete this update?" description="It will be removed from the project timeline." confirmLabel="Delete update" loading={deleting} onConfirm={remove} />}
    </>
  );
}
