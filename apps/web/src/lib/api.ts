import type { Profile, ProfilePreferences, AvatarGroup, HomeData, SearchResult, Work, PlaybackData, FallbackJob, AdminDashboard, Publication, PublicationDetail, Revision, RevisionCleanup, Session, Account, IntegrityCheck, AdminCatalogWork, AdminWorkDetail, AuditEntry, EditorialCollection, EditorialCollectionPreview, StorageMetrics, WorkDeletionPreview, WorkRating, HomeSectionConfig, Asset, Episode, VoiceActor, Character, WorkPlayableSources } from './types';

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
  getPublicShowcase: () => fetchApi<{ trending: Work[] }>('/api/public/showcase'),
  getPublicCharacters: () => fetchApi<Character[]>('/api/public/characters'),
  getPublicBannerCustomStates: () => fetchApi<Record<string, import('./promoBanners').BannerCustomState>>('/api/public/banners/custom-states'),
  login: (username: string, password: string) => fetchApi<Session>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) }),
  logout: () => fetchApi<void>('/api/auth/logout', { method: 'POST' }),
  getProfiles: () => fetchApi<Profile[]>('/api/profiles'),
  createProfile: (data: { name: string; avatar?: string | null; pin?: string | null; maxAgeRating?: number | null }) =>
    fetchApi<Profile>('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProfile: (id: string) => fetchApi<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
  updateProfile: (id: string, data: { name: string; avatar?: string | null; pin?: string | null; maxAgeRating?: number | null }) => fetchApi<Profile>(`/api/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getAvatarGroups: () => fetchApi<AvatarGroup[]>('/api/profiles/avatars'),
  unlockProfile: (id: string, pin?: string) => fetchApi<Profile>(`/api/profiles/${encodeURIComponent(id)}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pin ? { pin } : {}) }),
  getActiveProfile: () => fetchApi<Profile>('/api/profiles/active'),
  getProfilePreferences: (id: string) => fetchApi<ProfilePreferences>(`/api/profiles/${encodeURIComponent(id)}/preferences`),
  updateProfilePreferences: (id: string, data: Partial<ProfilePreferences>) => fetchApi<ProfilePreferences>(`/api/profiles/${encodeURIComponent(id)}/preferences`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getHome: (kind?: Work['contentKind']) => fetchApi<HomeData>(`/api/home${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`),
  searchWorks: (q: string, cursor?: string, kind?: Work['contentKind']) => fetchApi<SearchResult>(`/api/search?q=${encodeURIComponent(q)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`),
  getWork: (id: string) => fetchApi<Work>(`/api/works/${id}`),
  getWorkCharacters: (workId: string) => fetchApi<Character[]>(`/api/works/${encodeURIComponent(workId)}/characters`),
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
  updateAdminSeasonMetadata: (id: string, data: { title?: string | null; hidden?: boolean }) => fetchApi<{ id: string; title: string | null; hidden: boolean }>(`/api/admin/seasons/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAdminEpisode: (id: string, hidden: boolean) => fetchApi<{ id: string; hidden: boolean; workId: string }>(`/api/admin/episodes/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden }) }),
  updateAdminEpisodeMetadata: (id: string, data: { title?: string | null; synopsis?: string | null; hidden?: boolean; number?: number }) => fetchApi<Episode>(`/api/admin/episodes/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updatePresentationAsset: (workId: string, assetType: string, assetId: string) => fetchApi<void>(`/api/admin/works/${encodeURIComponent(workId)}/presentation`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetType, assetId }) }),
  updateEditorialWork: (id: string, data: { title?: string | null; synopsis?: string | null; hidden?: boolean | null; featured?: boolean | null }) => fetchApi<Pick<AdminCatalogWork, 'id'> & Partial<AdminCatalogWork>>(`/api/admin/works/${encodeURIComponent(id)}/editorial`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAdminWorkMetadata: (id: string, data: { title?: string | null; originalTitle?: string | null; year?: number | null; contentKind?: "movie" | "series" | "anime"; synopsis?: string | null; hidden?: boolean | null; featured?: boolean | null; genres?: string[]; certification?: string | null; trailerUrl?: string | null }) => fetchApi<AdminWorkDetail>(`/api/admin/works/${encodeURIComponent(id)}/metadata`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  uploadWorkAsset: async (workId: string, type: 'trailer' | 'poster' | 'backdrop', file: File) => {
    const query = new URLSearchParams({ type, filename: file.name });
    const res = await fetch(`/api/admin/works/${encodeURIComponent(workId)}/upload-asset?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-original-name': encodeURIComponent(file.name),
        'x-mime-type': file.type || 'application/octet-stream',
      },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ asset: Asset }>;
  },
  uploadEpisodeThumbnail: async (episodeId: string, file: File) => {
    const query = new URLSearchParams({ filename: file.name });
    const res = await fetch(`/api/admin/episodes/${encodeURIComponent(episodeId)}/upload-thumbnail?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-original-name': encodeURIComponent(file.name),
        'x-mime-type': file.type || 'image/jpeg',
      },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ asset: Asset }>;
  },
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
  deleteAccount: (id: string) => fetchApi<{ ok: boolean }>(`/api/admin/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  getAdminVoiceActors: (q = '') => fetchApi<VoiceActor[]>(`/api/admin/voice-actors${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  getAdminVoiceActor: (id: string) => fetchApi<VoiceActor>(`/api/admin/voice-actors/${encodeURIComponent(id)}`),
  createAdminVoiceActor: (data: { name: string; photoUrl?: string | null; bio?: string | null }) =>
    fetchApi<VoiceActor>('/api/admin/voice-actors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAdminVoiceActor: (id: string, data: { name?: string; photoUrl?: string | null; bio?: string | null }) =>
    fetchApi<VoiceActor>(`/api/admin/voice-actors/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteAdminVoiceActor: (id: string) => fetchApi<void>(`/api/admin/voice-actors/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadVoiceActorPhoto: async (file: File) => {
    const query = new URLSearchParams({ filename: file.name });
    const res = await fetch(`/api/admin/voice-actors/upload-photo?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-original-name': encodeURIComponent(file.name),
        'x-mime-type': file.type || 'image/jpeg',
      },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ photoUrl: string }>;
  },
  getAdminCharacters: (params?: { workId?: string; voiceActorId?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.workId) qs.set('workId', params.workId);
    if (params?.voiceActorId) qs.set('voiceActorId', params.voiceActorId);
    if (params?.q) qs.set('q', params.q);
    const query = qs.toString();
    return fetchApi<Character[]>(`/api/admin/characters${query ? `?${query}` : ''}`);
  },
  getAdminCharacter: (id: string) => fetchApi<Character>(`/api/admin/characters/${encodeURIComponent(id)}`),
  createAdminCharacter: (data: { name: string; workId?: string; workIds?: string[]; photoUrl?: string | null; bodyPhotoUrl?: string | null; role?: string | null; archetype?: string | null; profileSentiments?: string | null; voiceAudioUrl?: string | null; voiceActorId?: string | null; themeColor?: string | null }) =>
    fetchApi<Character>('/api/admin/characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateAdminCharacter: (id: string, data: { name?: string; workId?: string; workIds?: string[]; addWorkId?: string; removeWorkId?: string; photoUrl?: string | null; bodyPhotoUrl?: string | null; role?: string | null; archetype?: string | null; profileSentiments?: string | null; voiceAudioUrl?: string | null; voiceActorId?: string | null; themeColor?: string | null }) =>
    fetchApi<Character>(`/api/admin/characters/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteAdminCharacter: (id: string) => fetchApi<void>(`/api/admin/characters/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadCharacterPhoto: async (file: File) => {
    const query = new URLSearchParams({ filename: file.name });
    const res = await fetch(`/api/admin/characters/upload-photo?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-original-name': encodeURIComponent(file.name),
        'x-mime-type': file.type || 'image/jpeg',
      },
      body: file,
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json() as Promise<{ photoUrl: string; bodyPhotoUrl?: string; url?: string }>;
  },
  uploadCharacterAudio: async (file: File) => {
    const query = new URLSearchParams({ filename: file.name });
    const res = await fetch(`/api/admin/characters/upload-audio?${query}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-original-name': encodeURIComponent(file.name),
        'x-mime-type': file.type || 'audio/mpeg',
      },
      body: file,
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json() as Promise<{ voiceAudioUrl: string }>;
  },
  getWorkPlayableSources: (workId: string) => fetchApi<WorkPlayableSources>(`/api/admin/works/${encodeURIComponent(workId)}/playable-sources`),
  extractCharacterVoice: (clips: Array<{ mediaUrl: string; startSeconds: number; durationSeconds: number; audioOffsetSeconds?: number }>) =>
    fetchApi<{ voiceAudioUrl: string }>('/api/admin/characters/extract-voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clips }) }),
  getHomeSections: () => fetchApi<HomeSectionConfig[]>('/api/admin/home-sections'),
  updateHomeSections: (sections: HomeSectionConfig[]) => fetchApi<{ success: boolean; sections: HomeSectionConfig[] }>('/api/admin/home-sections', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sections }) }),
  getBannerCustomStates: () => fetchApi<Record<string, import('./promoBanners').BannerCustomState>>('/api/admin/banners/custom-states'),
  updateBannerCustomStates: (states: Record<string, import('./promoBanners').BannerCustomState>) =>
    fetchApi<{ success: true; states: Record<string, import('./promoBanners').BannerCustomState> }>('/api/admin/banners/custom-states', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ states }),
    }),
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
