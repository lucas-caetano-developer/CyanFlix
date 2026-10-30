import type { Profile, ProfilePreferences, HomeData, SearchResult, Work, PlaybackData, FallbackJob, AdminDashboard, Publication, PublicationDetail, Revision, RevisionCleanup, Session, Account, IntegrityCheck, AdminCatalogWork, AdminWorkDetail, AuditEntry, EditorialCollection, EditorialCollectionPreview, StorageMetrics, WorkDeletionPreview, WorkRating } from './types';

export async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getSession: () => fetchApi<Session>('/api/auth/session'),
  login: (username: string, password: string) => fetchApi<Session>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }),
  logout: () => fetchApi<void>('/api/auth/logout', { method: 'POST' }),
  getProfiles: () => fetchApi<Profile[]>('/api/profiles'),
  createProfile: (data: { name: string; avatar?: string }) =>
    fetchApi<Profile>('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProfile: (id: string) => fetchApi<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
  updateProfile: (id: string, data: { name: string; avatar?: string | null; pin?: string | null; maxAgeRating?: number | null }) => fetchApi<Profile>(`/api/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  unlockProfile: (id: string, pin?: string) => fetchApi<Profile>(`/api/profiles/${encodeURIComponent(id)}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pin ? { pin } : {}) }),
  getActiveProfile: () => fetchApi<Profile>('/api/profiles/active'),
  getProfilePreferences: (id: string) => fetchApi<ProfilePreferences>(`/api/profiles/${encodeURIComponent(id)}/preferences`),
  updateProfilePreferences: (id: string, data: Partial<ProfilePreferences>) => fetchApi<ProfilePreferences>(`/api/profiles/${encodeURIComponent(id)}/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getHome: (kind?: Work['contentKind']) => fetchApi<HomeData>(`/api/home${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  searchWorks: (q: string, cursor?: string, kind?: Work['contentKind']) => fetchApi<SearchResult>(`/api/search?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`),
  getWork: (id: string) => fetchApi<Work>(`/api/works/${id}`),
  getPlayback: (itemId: string) => fetchApi<PlaybackData>(`/api/playback/items/${itemId}`),
  requestFallback: (itemId: string) => fetchApi<FallbackJob>(`/api/playback/items/${itemId}/fallback`, { method: 'POST' }),
  getFallbackJob: (jobId: string) => fetchApi<FallbackJob>(`/api/playback/jobs/${jobId}`),
  getAdminDashboard: () => fetchApi<AdminDashboard>('/api/admin/dashboard'),
  getAdminPublications: (cursor?: string, state?: string) => fetchApi<{ items: Publication[]; nextCursor?: string | null }>(`/api/admin/publications?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(state ? { state } : {}) })}`),
  getAdminPublication: (id: string) => fetchApi<PublicationDetail>(`/api/admin/publications/${encodeURIComponent(id)}`),
  deleteAdminPublication: (id: string, confirmPackageId: string) => fetchApi<{ deleted: boolean; packageId: string }>(`/api/admin/publications/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmPackageId }) }),
  getAdminStorage: () => fetchApi<StorageMetrics>('/api/admin/storage'),
  getAdminIntegrity: () => fetchApi<IntegrityCheck[]>('/api/admin/integrity'),
  getAdminCatalog: (q = '', cursor?: string) => fetchApi<{ items: AdminCatalogWork[]; nextCursor?: string | null }>(`/api/admin/catalog${q || cursor ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(cursor ? { cursor } : {}) })}` : ''}`),
  getAdminWork: (id: string) => fetchApi<AdminWorkDetail>(`/api/admin/works/${encodeURIComponent(id)}`),
  getWorkDeletionPreview: (id: string) => fetchApi<WorkDeletionPreview>(`/api/admin/works/${encodeURIComponent(id)}/deletion-preview`),
  deleteAdminWork: (id: string, confirmTitle: string) => fetchApi<{ deleted: boolean; workId: string; stableId: string; title: string }>(`/api/admin/works/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmTitle }) }),
  updateAdminSeason: (id: string, hidden: boolean) => fetchApi<{ id: string; hidden: boolean; workId: string }>(`/api/admin/seasons/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) }),
  updateAdminEpisode: (id: string, hidden: boolean) => fetchApi<{ id: string; hidden: boolean; workId: string }>(`/api/admin/episodes/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) }),
  updatePresentationAsset: (workId: string, assetType: string, assetId: string) => fetchApi<void>(`/api/admin/works/${encodeURIComponent(workId)}/presentation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetType, assetId }) }),
  updateEditorialWork: (id: string, data: { title?: string | null; synopsis?: string | null; hidden?: boolean | null; featured?: boolean | null }) => fetchApi<Pick<AdminCatalogWork, 'id'> & Partial<AdminCatalogWork>>(`/api/admin/works/${encodeURIComponent(id)}/editorial`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getAdminCollections: () => fetchApi<EditorialCollection[]>('/api/admin/collections'),
  createAdminCollection: (data: { title: string; slug?: string }) => fetchApi<EditorialCollection>('/api/admin/collections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAdminCollection: (id: string, data: { title?: string; slug?: string; description?: string | null; active?: boolean; featured?: boolean; sortOrder?: number; workIds?: string[] }) => fetchApi<{ collection: EditorialCollection; workIds: string[] }>(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  previewAdminCollection: (id: string) => fetchApi<EditorialCollectionPreview>(`/api/admin/collections/${encodeURIComponent(id)}/preview`),
  publishAdminCollection: (id: string) => fetchApi<EditorialCollection>(`/api/admin/collections/${encodeURIComponent(id)}/publish`, { method: 'POST' }),
  unpublishAdminCollection: (id: string) => fetchApi<void>(`/api/admin/collections/${encodeURIComponent(id)}/unpublish`, { method: 'POST' }),
  deleteAdminCollection: (id: string) => fetchApi<void>(`/api/admin/collections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getAdminAudit: (targetId?: string) => fetchApi<AuditEntry[]>(`/api/admin/audit${targetId ? `?targetId=${encodeURIComponent(targetId)}` : ''}`),
  retryPublication: (id: string) => fetchApi<{ id: string; state: string }>(`/api/admin/publications/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  getAdminRevisions: () => fetchApi<Revision[]>('/api/admin/revisions'),
  activateRevision: (id: string) => fetchApi<void>(`/api/admin/revisions/${encodeURIComponent(id)}/activate`, { method: 'POST' }),
  getRevisionCleanup: () => fetchApi<RevisionCleanup>('/api/admin/revision-cleanup'),
  queueRevisionCleanup: (publicationIds: string[]) => fetchApi<{ queued: number }>('/api/admin/revision-cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicationIds }) }),
  retryRevisionCleanup: (id: string) => fetchApi<{ id: string; state: string }>(`/api/admin/revision-cleanup/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  getAdminAccounts: () => fetchApi<Account[]>('/api/admin/accounts'),
  createAccount: (data: { username: string; password: string; role: "admin" | "viewer" }) => fetchApi<Account>('/api/admin/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAccount: (id: string, data: { role?: "admin" | "viewer"; disabled?: boolean; password?: string }) => fetchApi<Account>(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  addFavorite: (profileId: string, workId: string) => fetchApi<void>(`/api/profiles/${profileId}/favorites/${workId}`, { method: 'POST' }),
  removeFavorite: (profileId: string, workId: string) => fetchApi<void>(`/api/profiles/${profileId}/favorites/${workId}`, { method: 'DELETE' }),
  getFavorites: (profileId: string) => fetchApi<Work[]>(`/api/profiles/${profileId}/favorites`),
  getWorkRating: (profileId: string, workId: string) => fetchApi<WorkRating>(`/api/profiles/${profileId}/ratings/${workId}`),
  setWorkRating: (profileId: string, workId: string, value: 1 | -1 | 0) => fetchApi<WorkRating>(`/api/profiles/${profileId}/ratings/${workId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) }),
  updateProgress: (profileId: string, itemId: string, data: { positionSeconds: number; durationSeconds?: number }, keepalive = false) =>
    fetchApi<void>(`/api/profiles/${profileId}/progress/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive }),
  getProgress: (profileId: string, itemId: string) =>
    fetchApi<{ positionSeconds: number; durationSeconds?: number | null; completed: boolean }>(`/api/profiles/${profileId}/progress/${itemId}`),
  getContinueWatching: (profileId: string) => fetchApi<Work[]>(`/api/profiles/${profileId}/continue-watching`),
  getUpNext: (profileId: string) => fetchApi<Work[]>(`/api/profiles/${profileId}/up-next`),
};
