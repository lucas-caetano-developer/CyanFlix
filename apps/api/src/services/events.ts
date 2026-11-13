import { prisma } from "@cyanflix/database";
import { getStoredHomeSections } from "./home-sections.js";

export type AdminEventSnapshot = {
  publications: string;
  transcodes: string;
  revisions: string;
  accounts: string;
  integrity: string;
  catalog: string;
  cleanup: string;
  home_sections: string;
};

export async function readAdminEventSnapshot(): Promise<AdminEventSnapshot> {
  const [
    publications,
    transcodes,
    revisions,
    accounts,
    integrity,
    catalog,
    collections,
    cleanup,
    homeSections,
  ] = await Promise.all([
    prisma.publication.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.transcodeJob.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.revision.findMany({
      select: { id: true, active: true },
      orderBy: { id: "asc" },
    }),
    prisma.account.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.integrityCheck.aggregate({
      _max: { completedAt: true, startedAt: true },
      _count: { _all: true },
    }),
    prisma.editorialOverride.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.editorialCollection.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    prisma.revisionCleanupJob.aggregate({
      _max: { updatedAt: true },
      _count: { _all: true },
    }),
    getStoredHomeSections(),
  ]);
  return {
    publications: `${publications._count._all}:${publications._max.updatedAt?.toISOString() ?? "-"}`,
    transcodes: `${transcodes._count._all}:${transcodes._max.updatedAt?.toISOString() ?? "-"}`,
    revisions:
      revisions
        .map((revision: any) => `${revision.id}:${revision.active ? 1 : 0}`)
        .join(",") || "-",
    accounts: `${accounts._count._all}:${accounts._max.updatedAt?.toISOString() ?? "-"}`,
    integrity: `${integrity._count._all}:${integrity._max.startedAt?.toISOString() ?? "-"}:${integrity._max.completedAt?.toISOString() ?? "-"}`,
    catalog: `${catalog._count._all}:${catalog._max.updatedAt?.toISOString() ?? "-"}:${collections._count._all}:${collections._max.updatedAt?.toISOString() ?? "-"}`,
    cleanup: `${cleanup._count._all}:${cleanup._max.updatedAt?.toISOString() ?? "-"}`,
    home_sections: homeSections
      .map((s: any) => `${s.id}:${s.enabled ? 1 : 0}:${s.sortOrder}:${s.title}`)
      .join("|"),
  };
}
