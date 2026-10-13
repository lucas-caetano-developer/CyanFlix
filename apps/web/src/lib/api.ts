import type { Profile, HomeData, Work, PlaybackData, FallbackJob, AdminDashboard, Publication } from './types';

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
  getSession: () => fetchApi<{ authenticated: boolean; role: string }>('/api/auth/session'),
  login: (password: string) => fetchApi<{ authenticated: boolean; role: string }>('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }),
  logout: () => fetchApi<void>('/api/auth/logout', { method: 'POST' }),
  getProfiles: () => fetchApi<Profile[]>('/api/profiles'),
  createProfile: (data: { name: string; avatar?: string; role?: string }) =>
    fetchApi<Profile>('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteProfile: (id: string) => fetchApi<void>(`/api/profiles/${id}`, { method: 'DELETE' }),
  getHome: () => fetchApi<HomeData>('/api/home'),
  searchWorks: (q: string) => fetchApi<Work[]>(`/api/search?q=${encodeURIComponent(q)}`),
  getWork: (id: string) => fetchApi<Work>(`/api/works/${id}`),
  getPlayback: (itemId: string) => fetchApi<PlaybackData>(`/api/playback/items/${itemId}`),
  requestFallback: (itemId: string) => fetchApi<FallbackJob>(`/api/playback/items/${itemId}/fallback`, { method: 'POST' }),
  getFallbackJob: (jobId: string) => fetchApi<FallbackJob>(`/api/playback/jobs/${jobId}`),
  getAdminDashboard: () => fetchApi<AdminDashboard>('/api/admin/dashboard'),
  getAdminPublications: () => fetchApi<Publication[]>('/api/admin/publications'),
  addFavorite: (profileId: string, workId: string) => fetchApi<void>(`/api/profiles/${profileId}/favorites/${workId}`, { method: 'POST' }),
  removeFavorite: (profileId: string, workId: string) => fetchApi<void>(`/api/profiles/${profileId}/favorites/${workId}`, { method: 'DELETE' }),
  getFavorites: (profileId: string) => fetchApi<Work[]>(`/api/profiles/${profileId}/favorites`),
  updateProgress: (profileId: string, itemId: string, data: { positionSeconds: number; durationSeconds?: number }) =>
    fetchApi<void>(`/api/profiles/${profileId}/progress/${itemId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  getProgress: (profileId: string, itemId: string) =>
    fetchApi<{ positionSeconds: number; durationSeconds?: number | null; completed: boolean }>(`/api/profiles/${profileId}/progress/${itemId}`),
  getContinueWatching: (profileId: string) => fetchApi<Work[]>(`/api/profiles/${profileId}/continue-watching`),
};
