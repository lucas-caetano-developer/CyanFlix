
export const profilePublicSelect = {
  id: true,
  name: true,
  avatar: true,
  role: true,
  preferences: true,
  maxAgeRating: true,
  pinHash: true,
  createdAt: true,
  updatedAt: true,
};

import type { FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { hashPassword } from "../auth.js";
import { preferredPresentationAssets } from "./catalog-helpers.js";

export const workPresentationAssetTypes = [
  "poster",
  "poster_card",
  "poster-card",
  "backdrop",
  "backdrop_card",
  "backdrop-card",
  "hero",
  "logo",
  "logo_webp",
  "trailer",
  "motion_preview",
];
export const seasonPresentationAssetTypes = [
  "poster",
  "poster_card",
  "poster-card",
  "trailer",
  "motion_preview",
  "season_presentation",
];
export const episodePresentationAssetTypes = [
  "episode_thumbnail",
  "thumbnail",
  "thumbnail_webp",
];

export const catalogAvailabilityWhere: Prisma.WorkWhereInput = {
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

export const catalogVisibilityWhere: Prisma.WorkWhereInput = {
  OR: [
    { editorialOverride: null },
    { editorialOverride: { is: { hidden: null } } },
    { editorialOverride: { is: { hidden: false } } },
  ],
};

export const workCardInclude = {
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
  editorialOverride: {
    select: {
      title: true,
      synopsis: true,
      hidden: true,
      featured: true,
      metadata: true,
    },
  },
};

export function readNestedArray(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  const nested = (value as Record<string, unknown>)[key];
  return Array.isArray(nested) ? nested : [];
}
export function readNestedObject(
  value: unknown,
  key: string,
): Record<string, unknown> | null {
  const object = readObject(value);
  return readObject(object[key]);
}
export function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function readMetadataString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === "string" && nested.trim() ? nested : null;
}
export function parseContentKind(
  value: unknown,
): "movie" | "series" | "anime" | undefined {
  return value === "movie" || value === "series" || value === "anime"
    ? value
    : undefined;
}
export function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9._@+-]{3,64}$/.test(username) ? username : null;
}
export type ProfileDtoInput = {
  id: string;
  name: string;
  avatar: string | null;
  role: string;
  preferences: unknown;
  maxAgeRating: number | null;
  pinHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export function toProfileDto(profile: ProfileDtoInput) {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    role: profile.role,
    preferences: profile.preferences,
    maxAgeRating: profile.maxAgeRating,
    pinProtected: Boolean(profile.pinHash),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
export async function parseProfileControls(
  body: { pin?: unknown; maxAgeRating?: unknown },
  reply: FastifyReply,
  partial = false,
): Promise<{ pinHash?: string | null; maxAgeRating?: number | null } | null> {
  const controls: { pinHash?: string | null; maxAgeRating?: number | null } =
    {};
  if (body.pin !== undefined) {
    if (body.pin === null || body.pin === "") controls.pinHash = null;
    else if (typeof body.pin !== "string" || !/^\d{4,8}$/.test(body.pin)) {
      await reply
        .code(400)
        .send({ error: "O PIN deve conter de 4 a 8 dígitos" });
      return null;
    } else controls.pinHash = await hashPassword(body.pin);
  } else if (!partial) controls.pinHash = null;
  if (body.maxAgeRating !== undefined) {
    if (body.maxAgeRating === null || body.maxAgeRating === "")
      controls.maxAgeRating = null;
    else {
      const value = Number(body.maxAgeRating);
      if (!Number.isInteger(value) || value < 0 || value > 18) {
        await reply.code(400).send({ error: "Classificação etária inválida" });
        return null;
      }
      controls.maxAgeRating = value;
    }
  } else if (!partial) controls.maxAgeRating = null;
  return controls;
}
export function profileAllowsWork(
  maxAgeRating: number | null,
  work: { metadata: unknown; seasons?: Array<{ metadata: unknown }> },
): boolean {
  if (maxAgeRating === null) return true;
  const ratings = [
    ageRatingFromMetadata(work.metadata),
    ...(work.seasons ?? []).map((season) =>
      ageRatingFromMetadata(season.metadata),
    ),
  ].filter((value): value is number => value !== null);
  return ratings.length === 0 || Math.max(...ratings) <= maxAgeRating;
}
export function ageRatingFromMetadata(value: unknown): number | null {
  const metadata = readObject(value);
  const candidates = [
    metadata.certification,
    metadata.content_rating,
    metadata.age_rating,
    metadata.parental_rating,
    readObject(metadata.tmdb).certification,
  ];
  for (const candidate of candidates) {
    if (
      typeof candidate === "number" &&
      Number.isInteger(candidate) &&
      candidate >= 0 &&
      candidate <= 18
    )
      return candidate;
    if (typeof candidate !== "string") continue;
    const normalized = candidate.trim().toUpperCase();
    if (["L", "LIVRE", "G", "TV-G", "TV-Y", "TV-Y7"].includes(normalized))
      return 0;
    if (normalized === "PG") return 10;
    if (["PG-13", "TV-14"].includes(normalized)) return 14;
    if (normalized === "R") return 17;
    if (["NC-17", "TV-MA"].includes(normalized)) return 18;
    const numeric = normalized.match(
      /(?:^|\D)(10|12|13|14|16|17|18)(?:\D|$)/,
    )?.[1];
    if (numeric) return Number(numeric);
  }
  return null;
}
export async function profileAllowsItem(
  maxAgeRating: number | null,
  itemId: string,
): Promise<boolean> {
  if (maxAgeRating === null) return true;
  const work = await prisma.work.findUnique({
    where: { id: itemId },
    select: { metadata: true, seasons: { select: { metadata: true } } },
  });
  if (work) return profileAllowsWork(maxAgeRating, work);
  const episode = await prisma.episode.findUnique({
    where: { id: itemId },
    select: {
      work: { select: { metadata: true } },
      season: { select: { metadata: true } },
    },
  });
  return episode
    ? profileAllowsWork(maxAgeRating, {
        metadata: episode.work.metadata,
        seasons: [episode.season],
      })
    : false;
}
export async function workRatingSummary(profileId: string, workId: string) {
  const [grouped, mine] = await Promise.all([
    prisma.workRating.groupBy({
      by: ["value"],
      where: { workId },
      _count: { _all: true },
    }),
    prisma.workRating.findUnique({
      where: { profileId_workId: { profileId, workId } },
      select: { value: true },
    }),
  ]);
  const count = (value: number) =>
    grouped.find((entry) => entry.value === value)?._count._all ?? 0;
  return { value: mine?.value ?? null, likes: count(1), dislikes: count(-1) };
}
export type PresentationAssetDtoInput = {
  id: string;
  type: string;
  publicPath: string | null;
  metadata: unknown;
};
export type WorkCardDtoInput = {
  id: string;
  title: string;
  originalTitle: string | null;
  contentKind: "movie" | "series" | "anime";
  year: number | null;
  synopsis: string | null;
  metadata: unknown;
  assets: PresentationAssetDtoInput[];
  seasons: Array<{
    id: string;
    number: number;
    title: string | null;
    metadata: unknown;
  }>;
  editorialOverride?: {
    title: string | null;
    synopsis: string | null;
    hidden: boolean | null;
    featured: boolean | null;
    metadata: unknown;
  } | null;
};
export function toPresentationAssetDto(asset: PresentationAssetDtoInput) {
  return {
    id: asset.id,
    type: asset.type,
    publicPath: asset.publicPath,
    metadata: asset.metadata,
  };
}
export function editorialAuditValue(
  value: {
    title: string | null;
    synopsis: string | null;
    hidden: boolean | null;
    featured: boolean | null;
    metadata: unknown;
    updatedByAccountId: string;
    updatedAt: Date;
  } | null,
) {
  return value
    ? {
        title: value.title,
        synopsis: value.synopsis,
        hidden: value.hidden,
        featured: value.featured,
        metadata: value.metadata,
        updatedByAccountId: value.updatedByAccountId,
        updatedAt: value.updatedAt.toISOString(),
      }
    : {};
}
export function normalizeCollectionSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
export function parseCollectionInput(body: {
  title?: unknown;
  slug?: unknown;
  description?: unknown;
  active?: unknown;
  featured?: unknown;
  sortOrder?: unknown;
  workIds?: unknown;
}):
  | { error: string }
  | {
      data: {
        title?: string;
        slug?: string;
        description?: string | null;
        active?: boolean;
        featured?: boolean;
        sortOrder?: number;
      };
      workIds?: string[];
    } {
  const data: {
    title?: string;
    slug?: string;
    description?: string | null;
    active?: boolean;
    featured?: boolean;
    sortOrder?: number;
  } = {};
  if (body.title !== undefined) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 120
    )
      return { error: "Título obrigatório, com até 120 caracteres" };
    data.title = body.title.trim();
  }
  if (body.slug !== undefined) {
    if (typeof body.slug !== "string") return { error: "Slug inválido" };
    const slug = normalizeCollectionSlug(body.slug);
    if (!slug) return { error: "Slug inválido" };
    data.slug = slug;
  }
  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string")
      return { error: "Descrição inválida" };
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > 500)
      return { error: "Descrição excede 500 caracteres" };
    data.description = description || null;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean")
      return { error: "Estado ativo inválido" };
    data.active = body.active;
  }
  if (body.featured !== undefined) {
    if (typeof body.featured !== "boolean")
      return { error: "Destaque inválido" };
    data.featured = body.featured;
  }
  if (body.sortOrder !== undefined) {
    const sortOrder = Number(body.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000)
      return { error: "Ordem inválida" };
    data.sortOrder = sortOrder;
  }
  let workIds: string[] | undefined;
  if (body.workIds !== undefined) {
    if (
      !Array.isArray(body.workIds) ||
      body.workIds.length > 100 ||
      body.workIds.some((id) => typeof id !== "string" || !id)
    )
      return { error: "Lista de obras inválida" };
    workIds = [...new Set(body.workIds as string[])];
    if (workIds.length !== body.workIds.length)
      return { error: "A coleção não pode repetir obras" };
  }
  return { data, workIds };
}
export function collectionAuditValue(
  value: {
    slug: string;
    title: string;
    description: string | null;
    state: string;
    active: boolean;
    featured: boolean;
    sortOrder: number;
    publishedAt: Date | null;
  },
  workIds: string[],
) {
  return {
    slug: value.slug,
    title: value.title,
    description: value.description,
    state: value.state,
    active: value.active,
    featured: value.featured,
    sortOrder: value.sortOrder,
    publishedAt: value.publishedAt?.toISOString() ?? null,
    workIds,
  };
}
export function toWorkCardDto(work: WorkCardDtoInput) {
  const overrideMetadata = readObject(work.editorialOverride?.metadata);
  return {
    id: work.id,
    title: work.editorialOverride?.title ?? work.title,
    originalTitle: work.originalTitle,
    contentKind: work.contentKind,
    year: work.year,
    synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
    metadata: { ...readObject(work.metadata), ...overrideMetadata },
    featured: work.editorialOverride?.featured ?? false,
    assets: preferredPresentationAssets(work.assets, overrideMetadata).map(
      toPresentationAssetDto,
    ),
    seasons: work.seasons.map((season) => ({
      id: season.id,
      number: season.number,
      title: season.title,
      metadata: season.metadata,
    })),
  };
}
export type WorkDetailsDtoInput = Omit<WorkCardDtoInput, "seasons"> & {
  characters?: Array<{
    id: string;
    name: string;
    photoUrl?: string | null;
    bodyPhotoUrl?: string | null;
    role?: string | null;
    archetype?: string | null;
    profileSentiments?: string | null;
    voiceAudioUrl?: string | null;
    themeColor?: string | null;
    voiceActor?: {
      id: string;
      name: string;
      photoUrl?: string | null;
    } | null;
  }>;
  seasons: Array<{
    id: string;
    number: number;
    title: string | null;
    metadata: unknown;
    completeness: unknown;
    assets: PresentationAssetDtoInput[];
    episodes: Array<{
      id: string;
      number: number;
      absoluteNumber: number | null;
      title: string | null;
      synopsis: string | null;
      metadata: unknown;
      markers: unknown;
      assets: PresentationAssetDtoInput[];
    }>;
  }>;
};
export function toWorkDetailsDto(work: WorkDetailsDtoInput) {
  const overrideMetadata = readObject(work.editorialOverride?.metadata);
  return {
    id: work.id,
    title: work.editorialOverride?.title ?? work.title,
    originalTitle: work.originalTitle,
    contentKind: work.contentKind,
    year: work.year,
    synopsis: work.editorialOverride?.synopsis ?? work.synopsis,
    metadata: { ...readObject(work.metadata), ...overrideMetadata },
    featured: work.editorialOverride?.featured ?? false,
    assets: preferredPresentationAssets(work.assets, overrideMetadata).map(
      toPresentationAssetDto,
    ),
    characters: (work.characters ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      photoUrl: c.photoUrl,
      bodyPhotoUrl: c.bodyPhotoUrl,
      role: c.role,
      archetype: c.archetype,
      profileSentiments: c.profileSentiments,
      voiceAudioUrl: c.voiceAudioUrl,
      themeColor: c.themeColor,
      voiceActor: c.voiceActor
        ? {
            id: c.voiceActor.id,
            name: c.voiceActor.name,
            photoUrl: c.voiceActor.photoUrl,
          }
        : null,
    })),
    seasons: work.seasons.map((season) => ({
      id: season.id,
      number: season.number,
      title: season.title,
      metadata: season.metadata,
      completeness: season.completeness,
      assets: season.assets.map(toPresentationAssetDto),
      episodes: season.episodes.map((episode) => ({
        id: episode.id,
        number: episode.number,
        absoluteNumber: episode.absoluteNumber,
        title: episode.title,
        synopsis: episode.synopsis,
        metadata: episode.metadata,
        markers: episode.markers,
        assets: episode.assets.map(toPresentationAssetDto),
      })),
    })),
  };
}

export function toJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) =>
      typeof nested === "bigint" ? Number(nested) : nested,
    ),
  ) as T;
}
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
export function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    output.push(items.slice(index, index + size));
  return output;
}

export type WorkCardDto = ReturnType<typeof toWorkCardDto>;
