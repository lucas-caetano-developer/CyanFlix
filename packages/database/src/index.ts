import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export type RevisionCleanupCandidate = {
  publicationId: string;
  packageId: string;
  scopeKey: string;
  revisionNumber: number;
  createdAt: Date;
  sizeBytes: bigint | null;
};
export type RevisionCleanupRevision = {
  id: string;
  publicationId: string;
  scopeKey: string;
  number: number;
  active: boolean;
  createdAt: Date;
  publication: { packageId: string; totalSizeBytes: bigint | null };
};

export async function findRevisionCleanupCandidates(retentionDays: number, keepPerScope: number, ignoreJobPublicationIds: string[] = []): Promise<RevisionCleanupCandidate[]> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60_000);
  const [revisions, seasons, episodes, existingJobs] = await Promise.all([
    prisma.revision.findMany({
      where: { publication: { state: "confirmed", receipt: { is: { status: "confirmed" } } } },
      orderBy: [{ scopeKey: "asc" }, { number: "desc" }],
      select: {
        id: true,
        publicationId: true,
        scopeKey: true,
        number: true,
        active: true,
        createdAt: true,
        publication: { select: { packageId: true, totalSizeBytes: true } },
      },
    }),
    prisma.season.findMany({ where: { activeRevisionId: { not: null } }, select: { activeRevisionId: true } }),
    prisma.episode.findMany({ where: { activeRevisionId: { not: null } }, select: { activeRevisionId: true } }),
    prisma.revisionCleanupJob.findMany({ select: { publicationId: true } }),
  ]);
  const referenced = new Set([
    ...seasons.map((item) => item.activeRevisionId),
    ...episodes.map((item) => item.activeRevisionId),
  ].filter((id): id is string => Boolean(id)));
  const ignoredJobs = new Set(ignoreJobPublicationIds);
  const queuedPublications = new Set(existingJobs.map((job) => job.publicationId).filter((id) => !ignoredJobs.has(id)));
  return selectRevisionCleanupCandidates(revisions, referenced, queuedPublications, cutoff, keepPerScope);
}

export function selectRevisionCleanupCandidates(
  revisions: RevisionCleanupRevision[],
  referenced: ReadonlySet<string>,
  queuedPublications: ReadonlySet<string>,
  cutoff: Date,
  keepPerScope: number,
): RevisionCleanupCandidate[] {
  const ordered = [...revisions].sort((left, right) => left.scopeKey.localeCompare(right.scopeKey) || right.number - left.number);
  const rankByScope = new Map<string, number>();
  const safeRevisionIds = new Set<string>();
  for (const revision of ordered) {
    const rank = rankByScope.get(revision.scopeKey) ?? 0;
    rankByScope.set(revision.scopeKey, rank + 1);
    if (!revision.active && !referenced.has(revision.id) && rank >= keepPerScope && revision.createdAt <= cutoff) safeRevisionIds.add(revision.id);
  }
  const byPublication = new Map<string, RevisionCleanupRevision[]>();
  for (const revision of ordered) {
    const rows = byPublication.get(revision.publicationId) ?? [];
    rows.push(revision);
    byPublication.set(revision.publicationId, rows);
  }
  const output: RevisionCleanupCandidate[] = [];
  for (const [publicationId, rows] of byPublication) {
    if (queuedPublications.has(publicationId) || rows.some((row) => !safeRevisionIds.has(row.id))) continue;
    const newest = rows.reduce((selected, row) => row.number > selected.number ? row : selected);
    output.push({
      publicationId,
      packageId: newest.publication.packageId,
      scopeKey: newest.scopeKey,
      revisionNumber: newest.number,
      createdAt: newest.createdAt,
      sizeBytes: newest.publication.totalSizeBytes,
    });
  }
  return output.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

export async function ensureDefaultProfile(accountId: string, accountRole: "owner" | "admin" | "viewer") {
  const profile = prisma.profile as any;
  await profile.updateMany({ where: { accountId: null }, data: { accountId } });

  if (accountRole === "owner" || accountRole === "admin") {
    const admin = await profile.findFirst({ where: { accountId, role: "admin" } });
    if (!admin) await profile.create({ data: { accountId, name: "Admin", avatar: "admin", role: "admin" } });
  }

  const viewer = await profile.findFirst({ where: { accountId, role: "viewer" } });
  if (!viewer) await profile.create({ data: { accountId, name: "Assistir", avatar: "play", role: "viewer" } });
}
