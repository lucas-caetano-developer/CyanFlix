export type Profile = { id: string; name: string; avatar?: string | null; role: string; createdAt?: string };

export type Asset = { id: string; type: string; relativePath: string; publicPath?: string | null; sizeBytes?: number; sha256?: string; metadata?: Record<string, unknown> };

export type Marker = { type: string; start_ms: number; end_ms: number; source?: string };
export type PlaybackTrack = { url?: string | null; metadata?: Record<string, unknown> };

export type Episode = { id: string; number: number; absoluteNumber?: number | null; title?: string | null; synopsis?: string | null; metadata?: Record<string, unknown>; markers?: Marker[]; hidden?: boolean; assets?: Asset[] };

export type Season = { id: string; number: number; title?: string | null; metadata?: Record<string, unknown>; completeness?: Record<string, unknown>; episodes?: Episode[]; assets?: Asset[] };

export type Work = { id: string; title: string; originalTitle?: string | null; contentKind: "movie" | "series" | "anime"; year?: number | null; synopsis?: string | null; metadata?: Record<string, unknown>; hidden?: boolean; assets?: Asset[]; seasons?: Season[] };

export type HomeData = { hero: Work | null; rows: Array<{ id: string; title: string; items: Work[] }> };

export type PlaybackData = { itemType: "movie" | "episode"; title: string; originalUrl: string; markers: Marker[]; subtitles: PlaybackTrack[]; audioTracks: PlaybackTrack[]; nextEpisode?: { id: string; title?: string | null; number: number } | null; fallback: { available: boolean; status: string; url?: string } };

export type FallbackJob = { jobId?: string; status?: string; url?: string; error?: string };

export type AdminDashboard = Record<string, number>;

export type Publication = { id: string; uploadId: string; packageId: string; state: string; createdAt: string; manifestSha256: string; errorMessage?: string | null; files: Array<{ relativePath: string; receivedAt?: string | null }>; receipt?: { status: string; confirmedAt: string; remoteRevision?: number } | null };
