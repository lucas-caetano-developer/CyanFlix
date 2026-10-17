import { expect, test, type Page, type Route } from '@playwright/test';

const viewerProfile = { id: 'profile-viewer', name: 'Viewer', role: 'viewer', pinProtected: false, maxAgeRating: null };
const adminProfile = { id: 'profile-admin', name: 'Admin', role: 'admin', pinProtected: false, maxAgeRating: null };

async function mockApi(page: Page, role: 'viewer' | 'owner') {
  const profile = role === 'owner' ? adminProfile : viewerProfile;
  await page.route('**/api/**', async (route) => respond(route, role, profile));
}

async function respond(route: Route, role: 'viewer' | 'owner', profile: typeof viewerProfile) {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/auth/session') return json(route, { authenticated: true, accountId: 'account-1', username: role, role });
  if (path === '/api/profiles') return json(route, [profile]);
  if (path === `/api/profiles/${profile.id}/unlock`) return json(route, profile);
  if (path === '/api/profiles/active') return json(route, profile);
  if (path === '/api/home') return json(route, { hero: { id: 'work-1', title: 'Obra E2E', contentKind: 'movie', assets: [] }, rows: [] });
  if (path === '/api/admin/events') return route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' });
  if (path === '/api/admin/dashboard') return json(route, { works: 1 });
  if (path === '/api/admin/publications' || path === '/api/admin/revisions' || path === '/api/admin/integrity' || path === '/api/admin/accounts' || path === '/api/admin/audit') return json(route, []);
  if (path === '/api/admin/catalog') return json(route, { items: [], nextCursor: null });
  if (path === '/api/admin/revision-cleanup') return json(route, { policy: { retentionDays: 30, keepPerScope: 2 }, candidates: [], jobs: [] });
  return json(route, {});
}

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

test('viewer selects a profile and reaches the streaming catalog', async ({ page }) => {
  await mockApi(page, 'viewer');
  await page.goto('/profiles');
  await page.getByRole('button', { name: /viewer/i }).click();
  await expect(page).toHaveURL(/\/browse$/);
  await expect(page.getByRole('heading', { name: 'Obra E2E' })).toBeVisible();
});

test('viewer cannot open the administrative product', async ({ page }) => {
  await mockApi(page, 'viewer');
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/profiles$/);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).not.toBeVisible();
});

test('owner can enter the administrative product', async ({ page }) => {
  await mockApi(page, 'owner');
  await page.goto('/profiles');
  await page.getByRole('button', { name: /admin/i }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Catálogo editorial' })).toBeVisible();
});
