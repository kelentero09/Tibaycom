import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { authMock, call, count, createProfile, createUser, env, installFetchMock, one, setSubscription, setupTestPlatform, teardownTestPlatform } from './harness';

vi.mock('@/server/auth', () => authMock());

import { DELETE as deleteUpdate, PATCH as editUpdate } from '@/app/api/project-updates/[id]/route';
import { PATCH as updateProfile, POST as createProfileRoute } from '@/app/api/profile/route';
import { POST as addUpdate } from '@/app/api/projects/[id]/updates/route';
import { POST as createProject } from '@/app/api/projects/route';
import { getFullProfile, getProjectUpdates, searchDirectory } from '@/server/profiles';

const project = { title: 'Two-storey house', description: 'Design and build', location: 'Cebu', year: 2026 };
const update = (n: number) => ({ date: `2026-0${n}-15`, title: `Milestone ${n}`, body: 'Progress', photoId: null });

beforeAll(async () => {
  await setupTestPlatform();
  installFetchMock();
  for (const id of ['ana', 'ben', 'cora', 'home', 'worker']) await createUser(id);
  for (const id of ['ana', 'ben', 'cora']) await createProfile(id);
  await setSubscription('ben', { endsInDays: 30 });
});
afterAll(teardownTestPlatform);

describe('projects with status and dates', () => {
  it('stores status and dates, defaulting older clients to a completed project', async () => {
    const legacy = await call(createProject, { as: 'ana', body: project });
    expect(legacy.status).toBe(200);
    expect(await one('SELECT status, start_date, end_date FROM projects WHERE id = ?', legacy.data.id)).toEqual({ status: 'completed', start_date: null, end_date: null });
    const dated = await call(createProject, { as: 'ben', body: { ...project, status: 'ongoing', startDate: '2026-03-01', endDate: '2026-12-20' } });
    expect(await one('SELECT status, start_date, end_date FROM projects WHERE id = ?', dated.data.id)).toEqual({ status: 'ongoing', start_date: '2026-03-01', end_date: '2026-12-20' });
  });

  it('rejects impossible dates and an end before the start', async () => {
    expect((await call(createProject, { as: 'ben', body: { ...project, startDate: '2026-02-30' } })).status).toBe(422);
    expect((await call(createProject, { as: 'ben', body: { ...project, startDate: '2026-05-01', endDate: '2026-04-01' } })).status).toBe(422);
    expect((await call(createProject, { as: 'ben', body: { ...project, status: 'demolished' } })).status).toBe(422);
  });
});

describe('project timeline updates', () => {
  it('enforces the Free limit per project and lets Premium add more', async () => {
    const free = await call(createProject, { as: 'cora', body: project });
    for (const n of [1, 2, 3]) expect((await call(addUpdate, { as: 'cora', params: { id: String(free.data.id) }, body: update(n) })).status).toBe(200);
    const blocked = await call(addUpdate, { as: 'cora', params: { id: String(free.data.id) }, body: update(4) });
    expect(blocked.status).toBe(402);
    expect(blocked.data.code).toBe('limit_reached');
    expect(await count('SELECT COUNT(*) AS n FROM project_updates WHERE project_id = ?', free.data.id)).toBe(3);

    const premium = await call(createProject, { as: 'ben', body: project });
    for (const n of [1, 2, 3, 4, 5]) expect((await call(addUpdate, { as: 'ben', params: { id: String(premium.data.id) }, body: update(n) })).status).toBe(200);
  });

  it('never lets one member touch another member’s project or updates', async () => {
    const own = await call(createProject, { as: 'ben', body: project });
    expect((await call(addUpdate, { as: 'ana', params: { id: String(own.data.id) }, body: update(1) })).status).toBe(404);
    const added = await call(addUpdate, { as: 'ben', params: { id: String(own.data.id) }, body: update(1) });
    expect((await call(editUpdate, { as: 'ana', params: { id: String(added.data.id) }, body: update(2) })).status).toBe(404);
    expect((await call(deleteUpdate, { as: 'ana', params: { id: String(added.data.id) } })).status).toBe(404);
    expect((await call(editUpdate, { as: 'ben', params: { id: String(added.data.id) }, body: { ...update(2), title: 'Roofing done' } })).status).toBe(200);
    expect((await one<{ title: string }>('SELECT title FROM project_updates WHERE id = ?', added.data.id))?.title).toBe('Roofing done');
    expect((await call(deleteUpdate, { as: 'ben', params: { id: String(added.data.id) } })).status).toBe(200);
  });

  it('only accepts a photo from the same project', async () => {
    const a = await call(createProject, { as: 'ben', body: project });
    const b = await call(createProject, { as: 'ben', body: project });
    await env.DB.prepare("INSERT INTO project_photos (id, project_id, profile_id, key, size_bytes) VALUES ('ph-b', ?, 'profile-ben', 'project/ben/00000000-0000-4000-8000-000000000001.webp', 10)").bind(b.data.id).run();
    expect((await call(addUpdate, { as: 'ben', params: { id: String(a.data.id) }, body: { ...update(1), photoId: 'ph-b' } })).status).toBe(422);
    expect((await call(addUpdate, { as: 'ben', params: { id: String(b.data.id) }, body: { ...update(1), photoId: 'ph-b' } })).status).toBe(200);
  });

  it('shows visitors only the updates the owner’s current plan allows', async () => {
    const p = await call(createProject, { as: 'ben', body: project });
    for (const n of [1, 2, 3, 4]) await call(addUpdate, { as: 'ben', params: { id: String(p.data.id) }, body: update(n) });
    expect(await getProjectUpdates(String(p.data.id), 3)).toHaveLength(3);
    expect((await getProjectUpdates(String(p.data.id))).map((u) => u.title)).toEqual(['Milestone 1', 'Milestone 2', 'Milestone 3', 'Milestone 4']);
  });
});

describe('account intents', () => {
  it('lets a homeowner join without a profession and keeps them out of the directory', async () => {
    const created = await call(createProfileRoute, { as: 'home', body: { username: 'maria-home', intent: 'seeking_contractor', businessName: 'Maria Santos', professions: [], province: 'Cebu', city: 'Argao' } });
    expect(created.status).toBe(200);
    expect((await one<{ intent: string }>("SELECT intent FROM profiles WHERE user_id = 'home'"))?.intent).toBe('seeking_contractor');
    const { results } = await searchDirectory({ page: 1 });
    expect(results.map((r) => r.username)).not.toContain('maria-home');
    // Asking the directory for homeowners explicitly still lists no homeowners.
    expect((await searchDirectory({ page: 1, intent: 'seeking_contractor' })).results.map((r) => r.username)).not.toContain('maria-home');
  });

  it('requires a profession for every professional intent', async () => {
    const body = { username: 'jun-worker', intent: 'seeking_work', businessName: 'Jun Reyes', professions: [], province: 'Cebu', city: 'Argao' };
    expect((await call(createProfileRoute, { as: 'worker', body })).status).toBe(422);
    expect((await call(createProfileRoute, { as: 'worker', body: { ...body, professions: ['mason'] } })).status).toBe(200);
    const { results } = await searchDirectory({ page: 1, intent: 'seeking_work' });
    expect(results.map((r) => r.username)).toEqual(['jun-worker']);
    expect(results[0]?.intent).toBe('seeking_work');
  });

  it('lets members change their intent', async () => {
    const body = { intent: 'hiring', businessName: 'Ana Builders', bio: '', professions: ['general-contractor'], specializations: [], services: [], yearsExperience: null, province: 'Cebu', city: 'Argao', serviceAreas: [], phone: '', contactEmail: '', facebookUrl: '', messengerUrl: '', isPublished: true };
    expect((await call(updateProfile, { as: 'ana', body })).status).toBe(200);
    expect((await one<{ intent: string }>("SELECT intent FROM profiles WHERE user_id = 'ana'"))?.intent).toBe('hiring');
  });
});

describe('owner preview', () => {
  it('shows the owner the same limited view a visitor gets', async () => {
    // cora is on Free (2 projects); add a third directly to simulate a lapsed Premium.
    await env.DB.prepare("INSERT INTO projects (id, profile_id, title, created_at, updated_at) VALUES ('over-1', 'profile-cora', 'Over limit', ?, ?)").bind(Date.now() + 1000, Date.now() + 1000).run();
    await env.DB.prepare("INSERT INTO projects (id, profile_id, title, created_at, updated_at) VALUES ('over-2', 'profile-cora', 'Over limit 2', ?, ?)").bind(Date.now() + 2000, Date.now() + 2000).run();
    const owner = await getFullProfile('pro-cora', 'cora');
    const preview = await getFullProfile('pro-cora', 'cora', false, true);
    const visitor = await getFullProfile('pro-cora', null);
    expect(owner!.projects.length).toBeGreaterThan(2);
    expect(preview!.projects.map((p) => p.id)).toEqual(visitor!.projects.map((p) => p.id));
    expect(preview!.projects).toHaveLength(2);
    expect(preview!.isOwner).toBe(true);
  });
});
