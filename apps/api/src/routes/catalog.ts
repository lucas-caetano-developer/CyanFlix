import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { requireActiveProfile, requireActiveOwnedProfile } from "../lib/auth-guards.js";
import {
  toWorkCardDto,
  toJson,
  profileAllowsItem,
  toWorkDetailsDto,
  profileAllowsWork,
  parseContentKind,
  readObject,
  workCardInclude,
  workPresentationAssetTypes,
  seasonPresentationAssetTypes,
  episodePresentationAssetTypes,
} from "../lib/mappers.js";
import { catalogGenreRows, recommendationTokens, recommendationScore, catalogAvailability } from "../lib/catalog-helpers.js";
import { getStoredHomeSections } from "../services/home-sections.js";
import { findPlayableSeasonEpisodes } from "../services/playback.js";

export async function catalogRoutes(app: FastifyInstance) {
app.get("/api/public/showcase", async () => {
  const works = await prisma.work.findMany({
    where: { hidden: false },
    take: 12,
    orderBy: { createdAt: "desc" },
    include: workCardInclude,
  });
  return toJson({
    trending: works.map(toWorkCardDto),
  });
});

const workCardInclude = {
  assets: {
    where: {
      seasonId: null,
      episodeId: null,
      type: { in: workPresentationAssetTypes },
      publication: {
        state: "confirmed" as const,
        revisions: { some: { active: true } },
      },
    },
    orderBy: { createdAt: "desc" as const },
    select: { id: true, type: true, publicPath: true, metadata: true },
  },
  seasons: {
    where: { hidden: false },
    orderBy: { number: "asc" as const },
    select: { id: true, number: true, title: true, metadata: true },
  },
  editorialOverride: true,
} as const;
const catalogAvailabilityWhere: Prisma.WorkWhereInput = {
  OR: [
    {
      mediaObjects: {
        some: {
          kind: "movie_hls",
          publication: {
            state: "confirmed",
            revisions: { some: { active: true } },
          },
        },
      },
    },
    {
      episodes: {
        some: {
          hidden: false,
          activeRevisionId: { not: null },
          mediaObjects: {
            some: { kind: "episode_hls", publication: { state: "confirmed" } },
          },
        },
      },
    },
  ],
};
const catalogVisibilityWhere: Prisma.WorkWhereInput = {
  OR: [
    { editorialOverride: null },
    { editorialOverride: { is: { hidden: null } } },
    { editorialOverride: { is: { hidden: false } } },
  ],
};
app.get("/api/home", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const kind = parseContentKind((request.query as { kind?: string }).kind);
  const [works, collections, favorites, history, popularProgress] =
    await Promise.all([
      prisma.work.findMany({
        where: {
          hidden: false,
          AND: [catalogAvailabilityWhere, catalogVisibilityWhere],
          ...(kind ? { contentKind: kind } : {}),
        },
        include: workCardInclude,
        orderBy: [
          { editorialOverride: { featured: "desc" } },
          { createdAt: "desc" },
        ],
        take: 100,
      }),
      prisma.editorialCollection.findMany({
        where: { state: "published", active: true },
        orderBy: [
          { featured: "desc" },
          { sortOrder: "asc" },
          { publishedAt: "desc" },
        ],
        take: 20,
        include: {
          items: {
            where: {
              work: {
                hidden: false,
                AND: [catalogAvailabilityWhere, catalogVisibilityWhere],
                ...(kind ? { contentKind: kind } : {}),
              },
            },
            orderBy: { position: "asc" },
            include: { work: { include: workCardInclude } },
          },
        },
      }),
      prisma.favorite.findMany({
        where: { profileId: profile.id },
        take: 30,
        select: {
          workId: true,
          work: { select: { metadata: true, contentKind: true } },
        },
      }),
      prisma.viewingProgress.findMany({
        where: { profileId: profile.id },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          workId: true,
          episode: {
            select: {
              workId: true,
              work: { select: { metadata: true, contentKind: true } },
            },
          },
          work: { select: { metadata: true, contentKind: true } },
        },
      }),
      prisma.viewingProgress.groupBy({
        by: ["workId"],
        _count: { workId: true },
        where: { workId: { not: null } },
        orderBy: { _count: { workId: "desc" } },
        take: 30,
      }),
    ]);
  const allCards = works
    .filter((work) => profileAllowsWork(profile.maxAgeRating, work))
    .map(toWorkCardDto);
  const collectionRows = collections
    .filter((col) => col.slug !== "__cyanflix_home_sections__")
    .map((collection) => ({
      id: `collection:${collection.slug}`,
      title: collection.title,
      items: collection.items
        .map((item) => item.work)
        .filter((work) => profileAllowsWork(profile.maxAgeRating, work))
        .map(toWorkCardDto),
    }))
    .filter((row) => row.items.length > 0);
  const genreRows = catalogGenreRows(allCards);
  const dubbed = allCards.filter((item) =>
    catalogAvailability(item).includes("DUB"),
  );
  const subtitled = allCards.filter((item) =>
    catalogAvailability(item).includes("LEG"),
  );
  const recommendationSeeds = [
    ...favorites.map((row) => ({ id: row.workId, ...row.work })),
    ...history
      .map((row) =>
        row.work
          ? { id: row.workId!, ...row.work }
          : row.episode
            ? { id: row.episode.workId, ...row.episode.work }
            : null,
      )
      .filter(
        (
          row,
        ): row is {
          id: string;
          metadata: Prisma.JsonValue;
          contentKind: "movie" | "series" | "anime";
        } => Boolean(row),
      ),
  ];
  const seedIds = new Set(recommendationSeeds.map((seed) => seed.id));
  const taste = recommendationSeeds.flatMap((seed) =>
    recommendationTokens(seed.metadata),
  );
  const seedKinds = recommendationSeeds.map((seed) => seed.contentKind);
  const recommendations = allCards
    .filter((card) => !seedIds.has(card.id))
    .map((card) => ({
      card,
      score: recommendationScore(card, taste, seedKinds),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((entry) => entry.card);

  // Mais assistidos
  const popularWorkIds = new Set(
    popularProgress.map((p) => p.workId).filter(Boolean),
  );
  const popularCards = [
    ...allCards.filter((c) => popularWorkIds.has(c.id)),
    ...allCards.filter((c) => !popularWorkIds.has(c.id)),
  ];

  const rowMap = new Map<
    string,
    { id: string; defaultTitle: string; items: typeof allCards }
  >();
  rowMap.set("featured", {
    id: "featured",
    defaultTitle: "Destaques",
    items: allCards.filter((item) => item.featured),
  });
  rowMap.set("popular", {
    id: "popular",
    defaultTitle: "Mais assistidos",
    items: popularCards,
  });
  rowMap.set("recent", {
    id: "recent",
    defaultTitle: "Adicionados recentemente",
    items: allCards,
  });
  rowMap.set("anime", {
    id: "anime",
    defaultTitle: "Animes",
    items: allCards.filter((item) => item.contentKind === "anime"),
  });
  rowMap.set("movies", {
    id: "movies",
    defaultTitle: "Filmes",
    items: allCards.filter((item) => item.contentKind === "movie"),
  });
  rowMap.set("series", {
    id: "series",
    defaultTitle: "Séries",
    items: allCards.filter((item) => item.contentKind === "series"),
  });
  rowMap.set("dubbed", {
    id: "dubbed",
    defaultTitle: "Dublado",
    items: dubbed,
  });
  rowMap.set("subtitled", {
    id: "subtitled",
    defaultTitle: "Legendado",
    items: subtitled,
  });
  rowMap.set("recommended", {
    id: "recommended",
    defaultTitle: "Para você",
    items: recommendations,
  });

  for (const col of collectionRows) {
    rowMap.set(col.id, {
      id: col.id,
      defaultTitle: col.title,
      items: col.items,
    });
  }
  for (const gr of genreRows) {
    rowMap.set(gr.id, { id: gr.id, defaultTitle: gr.title, items: gr.items });
  }

  function matchGenreWorks(genreKey: string) {
    const term = genreKey.toLowerCase();
    return allCards.filter((card) => {
      const meta = readObject(card.metadata);
      const direct = Array.isArray(meta.genres) ? meta.genres : [];
      const anilist = readObject(meta.anilist);
      const nested = Array.isArray(anilist.genres) ? anilist.genres : [];
      const all = [...direct, ...nested].map((g) => String(g).toLowerCase());
      if (term === "action" || term === "ação" || term === "acao")
        return all.some(
          (g) =>
            g.includes("ação") || g.includes("acao") || g.includes("action"),
        );
      if (term === "comedy" || term === "comédia" || term === "comedia")
        return all.some(
          (g) =>
            g.includes("comédia") ||
            g.includes("comedia") ||
            g.includes("comedy"),
        );
      if (term === "drama") return all.some((g) => g.includes("drama"));
      if (term === "scifi" || term === "ficção" || term === "ficção científica")
        return all.some(
          (g) =>
            g.includes("ficção") || g.includes("sci-fi") || g.includes("scifi"),
        );
      if (term === "thriller" || term === "suspense" || term === "terror")
        return all.some(
          (g) =>
            g.includes("suspense") ||
            g.includes("terror") ||
            g.includes("thriller") ||
            g.includes("horror"),
        );
      if (term === "animation" || term === "animação" || term === "animacao")
        return all.some(
          (g) =>
            g.includes("animação") ||
            g.includes("animacao") ||
            g.includes("animation"),
        );
      return all.some((g) => g.includes(term));
    });
  }

  const storedSections = await getStoredHomeSections();
  const configuredRows: Array<{
    id: string;
    title: string;
    items: typeof allCards;
  }> = [];

  for (const sec of storedSections) {
    if (!sec.enabled) continue;
    let found = rowMap.get(sec.id);
    if (!found && sec.id.startsWith("genre:")) {
      const gTerm = sec.id.replace(/^genre:/, "");
      const matched = matchGenreWorks(gTerm);
      if (matched.length > 0) {
        found = { id: sec.id, defaultTitle: sec.defaultTitle, items: matched };
      }
    }
    if (found && found.items.length > 0) {
      configuredRows.push({
        id: found.id,
        title: sec.title.trim() || found.defaultTitle,
        items: found.items.slice(0, 24),
      });
    }
  }

  const finalRows =
    configuredRows.length > 0
      ? configuredRows
      : [
          {
            id: "featured",
            title: "Destaques",
            items: allCards.filter((item) => item.featured).slice(0, 24),
          },
          {
            id: "recommended",
            title: "Para você",
            items: recommendations.slice(0, 24),
          },
          {
            id: "recent",
            title: "Adicionados recentemente",
            items: allCards.slice(0, 24),
          },
          { id: "dubbed", title: "Dublado", items: dubbed.slice(0, 24) },
          {
            id: "subtitled",
            title: "Legendado",
            items: subtitled.slice(0, 24),
          },
          ...collectionRows,
          {
            id: "movies",
            title: "Filmes",
            items: allCards
              .filter((item) => item.contentKind === "movie")
              .slice(0, 24),
          },
          {
            id: "series",
            title: "Séries",
            items: allCards
              .filter((item) => item.contentKind === "series")
              .slice(0, 24),
          },
          {
            id: "anime",
            title: "Animes",
            items: allCards
              .filter((item) => item.contentKind === "anime")
              .slice(0, 24),
          },
          ...genreRows,
        ];

  return toJson({
    hero: allCards.find((item) => item.featured) ?? allCards[0] ?? null,
    rows: finalRows,
  });
});
app.get("/api/search", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const query = request.query as {
    q?: string;
    cursor?: string;
    limit?: string;
    kind?: string;
  };
  const q = String(query.q ?? "")
    .trim()
    .slice(0, 200);
  if (!q) return { items: [], nextCursor: null };
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(query.limit ?? "24", 10) || 24),
  );
  const kind = parseContentKind(query.kind);
  const cursor = query.cursor
    ? await prisma.work.findUnique({
        where: { id: query.cursor },
        select: { id: true, createdAt: true },
      })
    : null;
  const works = await prisma.work.findMany({
    where: {
      hidden: false,
      ...(kind ? { contentKind: kind } : {}),
      AND: [
        catalogAvailabilityWhere,
        catalogVisibilityWhere,
        {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { originalTitle: { contains: q, mode: "insensitive" } },
            { synopsis: { contains: q, mode: "insensitive" } },
            { searchText: { contains: q, mode: "insensitive" } },
            {
              editorialOverride: {
                is: { title: { contains: q, mode: "insensitive" } },
              },
            },
            {
              editorialOverride: {
                is: { synopsis: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        },
        ...(cursor
          ? [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    include: workCardInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(201, limit * 4 + 1),
  });
  const allowed = works.filter((work) =>
    profileAllowsWork(profile.maxAgeRating, work),
  );
  const hasMore =
    allowed.length > limit || works.length === Math.min(201, limit * 4 + 1);
  const page = allowed.slice(0, limit);
  const nextCursor = hasMore
    ? (page.at(-1)?.id ?? works.at(-1)?.id ?? null)
    : null;
  return toJson({ items: page.map(toWorkCardDto), nextCursor });
});
app.get("/api/works/:id", async (request, reply) => {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return;
  const work = await prisma.work.findUnique({
    where: { id: (request.params as { id: string }).id },
    include: {
      assets: {
        where: {
          seasonId: null,
          episodeId: null,
          type: { in: workPresentationAssetTypes },
          publication: {
            state: "confirmed",
            revisions: { some: { active: true } },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      seasons: {
        where: { hidden: false },
        orderBy: { number: "asc" },
        include: {
          assets: {
            where: {
              episodeId: null,
              type: { in: seasonPresentationAssetTypes },
              publication: {
                state: "confirmed",
                revisions: { some: { active: true } },
              },
            },
            orderBy: { createdAt: "desc" },
          },
          episodes: {
            where: { hidden: false },
            orderBy: { number: "asc" },
            include: {
              assets: {
                where: {
                  type: { in: episodePresentationAssetTypes },
                  publication: { state: "confirmed" },
                },
                orderBy: { createdAt: "desc" },
              },
            },
          },
        },
      },
      editorialOverride: true,
    },
  });
  if (
    !work ||
    work.hidden ||
    work.editorialOverride?.hidden === true ||
    !profileAllowsWork(profile.maxAgeRating, work)
  )
    return reply.code(404).send({ error: "Obra não encontrada" });
  const activeRevisionIds = work.seasons.flatMap((season) =>
    season.episodes
      .map((episode) => episode.activeRevisionId)
      .filter((id): id is string => Boolean(id)),
  );
  const activeRevisions = activeRevisionIds.length
    ? await prisma.revision.findMany({
        where: { id: { in: activeRevisionIds } },
        select: { id: true, publicationId: true },
      })
    : [];
  const publicationByRevision = new Map(
    activeRevisions.map((revision) => [revision.id, revision.publicationId]),
  );
  const episodeIds = work.seasons.flatMap((season) =>
    season.episodes.map((episode) => episode.id),
  );
  const activeMedia = episodeIds.length
    ? await prisma.mediaObject.findMany({
        where: {
          episodeId: { in: episodeIds },
          kind: "episode_hls",
          publication: { state: "confirmed" },
        },
        select: { episodeId: true, publicationId: true },
      })
    : [];
  const playablePairs = new Set(
    activeMedia.map((media) => `${media.episodeId}:${media.publicationId}`),
  );
  for (const season of work.seasons) {
    season.episodes = season.episodes.filter((episode) => {
      const publicationId = episode.activeRevisionId
        ? publicationByRevision.get(episode.activeRevisionId)
        : undefined;
      if (
        !publicationId ||
        !playablePairs.has(`${episode.id}:${publicationId}`)
      )
        return false;
      episode.assets = episode.assets.filter(
        (asset) => asset.publicationId === publicationId,
      );
      return true;
    });
  }
  return toJson(toWorkDetailsDto(work));
});

app.post(
  "/api/profiles/:profileId/favorites/:workId",
  async (request, reply) => {
    const { profileId, workId } = request.params as {
      profileId: string;
      workId: string;
    };
    const profile = await requireActiveOwnedProfile(request, profileId, reply);
    if (!profile) return;
    if (!(await profileAllowsItem(profile.maxAgeRating, workId)))
      return reply.code(404).send({ error: "Obra não encontrada" });
    await prisma.favorite.upsert({
      where: { profileId_workId: { profileId, workId } },
      create: { profileId, workId },
      update: {},
    });
    return reply.code(204).send();
  },
);
app.delete(
  "/api/profiles/:profileId/favorites/:workId",
  async (request, reply) => {
    const { profileId, workId } = request.params as {
      profileId: string;
      workId: string;
    };
    await requireActiveOwnedProfile(request, profileId, reply);
    if (reply.sent) return;
    await prisma.favorite.deleteMany({ where: { profileId, workId } });
    return reply.code(204).send();
  },
);
}
