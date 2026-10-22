export type ProfilePreferences = { autoplayNextEpisode: boolean; subtitleStyle: "small" | "medium" | "large" };
export type Profile = { id: string; name: string; avatar?: string | null; role: string; preferences?: Partial<ProfilePreferences>; pinProtected: boolean; maxAgeRating?: number | null; createdAt?: string };
export type Session = { authenticated: boolean; accountId: string; username: string; role: "owner" | "admin" | "viewer" };
export type Account = { id: string; username: string; role: "owner" | "admin" | "viewer"; disabled: boolean; createdAt: string; updatedAt?: string; _count?: { profiles: number } };
export type IntegrityCheck = { id: string; state: "running" | "passed" | "failed"; checkedAssets: number; hashedAssets: number; missingAssets: number; corruptAssets: number; startedAt: string; completedAt?: string | null };
export type AdminCatalogWork = { id: string; canonicalTitle: string; canonicalSynopsis?: string | null; title: string; synopsis?: string | null; contentKind: "movie" | "series" | "anime"; year?: number | null; hidden: boolean; featured: boolean; seasonCount: number; episodeCount: number; override?: { title?: string | null; synopsis?: string | null; hidden?: boolean | null; featured?: boolean | null; updatedAt: string } | null };
export type AdminWorkDetail = { id: string; title: string; editorialOverride?: { metadata?: Record<string, unknown> } | null; assets: Array<{ id: string; type: string; publicPath?: string | null; sizeBytes: number }>; seasons: Array<{ id: string; number: number; title?: string | null; hidden: boolean; assets: Array<{ id: string; type: string; publicPath?: string | null; sizeBytes: number }>; episodes: Array<{ id: string; number: number; title?: string | null; hidden: boolean; activeRevisionId?: string | null }> }> };
export type AuditEntry = { id: string; action: string; targetType: string; targetId: string; beforeValue?: Record<string, unknown> | null; afterValue?: Record<string, unknown> | null; createdAt: string; actor: { username: string; role: string } };
export type EditorialCollection = { id: string; slug: string; title: string; description?: string | null; state: "draft" | "published"; active: boolean; featured: boolean; sortOrder: number; publishedAt?: string | null; updatedAt: string; items: Array<{ position: number; workId: string; work: { id: string; title: string; contentKind: Work["contentKind"]; editorialOverride?: { title?: string | null; hidden?: boolean | null } | null } }> };
export type EditorialCollectionPreview = { id: string; title: string; state: string; valid: boolean; items: Array<{ work: Work; eligible: boolean }> };

export type Asset = { id: string; type: string; relativePath: string; publicPath?: string | null; sizeBytes?: number; sha256?: string; metadata?: Record<string, unknown> };

export type Marker = { type: string; start_ms: number; end_ms: number; source?: string };
export type PlaybackTrack = { url?: string | null; metadata?: Record<string, unknown> };

export type Episode = { id: string; number: number; absoluteNumber?: number | null; title?: string | null; synopsis?: string | null; metadata?: Record<string, unknown>; markers?: Marker[]; hidden?: boolean; assets?: Asset[] };

export type Season = { id: string; number: number; title?: string | null; metadata?: Record<string, unknown>; completeness?: Record<string, unknown>; episodes?: Episode[]; assets?: Asset[] };

export type ContinueWatching = { itemId: string; itemType: "movie" | "episode"; episodeNumber?: number | null; episodeTitle?: string | null; seasonNumber?: number | null; positionSeconds: number; durationSeconds?: number | null; progressPercent: number; updatedAt: string };

export type Work = { id: string; title: string; originalTitle?: string | null; contentKind: "movie" | "series" | "anime"; year?: number | null; synopsis?: string | null; metadata?: Record<string, unknown>; hidden?: boolean; featured?: boolean; assets?: Asset[]; seasons?: Season[]; continueWatching?: ContinueWatching };

export type HomeData = { hero: Work | null; rows: Array<{ id: string; title: string; items: Work[] }> };
export type SearchResult = { items: Work[]; nextCursor?: string | null };

export type PlaybackData = { itemType: "movie" | "episode"; itemId?: string; seasonNumber?: number; title: string; originalUrl: string; delivery?: Record<string, unknown>; markers: Marker[]; subtitles: PlaybackTrack[]; audioTracks: PlaybackTrack[]; episodes?: Array<{ id: string; title?: string | null; number: number }>; nextEpisode?: { id: string; title?: string | null; number: number } | null; fallback: { available: boolean; status: string; url?: string } };

export type FallbackJob = { jobId?: string; status?: string; url?: string; error?: string; adaptive?: boolean };

export type AdminDashboard = Record<string, number>;

export type Publication = { id: string; uploadId: string; packageId: string; packageType?: string; state: string; createdAt: string; manifestSha256: string; totalSizeBytes?: number | null; errorMessage?: string | null; finalizationAttempts?: number; finalizationLeaseUntil?: string | null; finalizationNextAttemptAt?: string | null; files?: Array<{ relativePath: string; expectedSha256?: string | null; expectedBytes?: number | null; receivedSha256?: string | null; receivedBytes?: number | null; receivedAt?: string | null }>; receipt?: { status: string; confirmedAt: string; remoteRevision?: number } | null; revisions?: Array<{ id: string; number: number; scopeKey: string; active: boolean }>; _count?: { files: number } };
export type PublicationDetail = Publication & { manifest: Record<string, unknown>; diff: { previousRevision?: number | null; added: string[]; removed: string[]; changed: string[] } };
export type StorageMetrics = { assets: { count: number; bytes: number }; media: { count: number; bytes: number }; publications: { count: number; bytes: number }; transcodeCache: { count: number; bytes: number }; disk?: { totalBytes: number; freeBytes: number } | null };

export type Revision = { id: string; scopeKey: string; number: number; active: boolean; createdAt: string; packageId: string; packageType: "movie" | "season" | "episode_replacement"; publicationState: string; receiptStatus?: string | null; workTitle: string; seasonTitle?: string | null; episodeTitle?: string | null; episodeNumber?: number | null };
export type WorkDeletionPreview = {
  work: { id: string; stableId: string; title: string; contentKind: "movie" | "series" | "anime" };
  counts: { seasons: number; episodes: number; assets: number; mediaObjects: number; favorites: number; progress: number; collectionItems: number; publications: number; transcodeJobs: number; bytes: number };
  blockers: string[];
  canDelete: boolean;
  publications: Array<{ id: string; packageId: string; packageType: string; state: string; receiptStatus?: string | null; revisions: Array<{ id: string; scopeKey: string; number: number; active: boolean }>; fileCount: number; totalSizeBytes: number }>;
  transcodeJobs: Array<{ id: string; state: string; sizeBytes: number }>;
};
export type RevisionCleanup = {
  policy: { retentionDays: number; keepPerScope: number };
  candidates: Array<{ publicationId: string; packageId: string; scopeKey: string; revisionNumber: number; createdAt: string; sizeBytes?: number | null }>;
  jobs: Array<{ id: string; publicationId: string; state: "queued" | "processing" | "completed" | "failed"; attempts: number; sizeBytes?: number | null; error?: string | null; createdAt: string; completedAt?: string | null }>;
};
