import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { env, activeUploads, activeWorkDeletions } from "../lib/config.js";
import { safeDataPath, directoryExists } from "../lib/storage.js";
import { jsonValue, toJson } from "../lib/mappers.js";

export async function publicationStatus(publicationId: string, reply: any) {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { files: true, receipt: true },
  });
  if (!publication)
    return reply.code(404).send({ error: "Publicação não encontrada" });
  return toJson({
    upload_id: publication.uploadId,
    state: publication.state,
    error: publication.errorMessage,
    missing_paths: publication.files
      .filter((item) => !item.receivedAt)
      .map((item) => item.relativePath),
    received_paths: publication.files
      .filter((item) => item.receivedAt)
      .map((item) => item.relativePath),
    receipt: publication.receipt
      ? {
          publication_id: publication.receipt.publicationId,
          package_id: publication.receipt.packageId,
          remote_work_id: publication.receipt.remoteWorkId,
          remote_season_id: publication.receipt.remoteSeasonId,
          remote_episode_ids: publication.receipt.remoteEpisodeIds,
          remote_revision: publication.receipt.remoteRevision,
          manifest_sha256: publication.receipt.manifestSha256,
          status: publication.receipt.status,
          confirmed_at: publication.receipt.confirmedAt,
        }
      : null,
  });
}

export class PublicationDeletionConflict extends Error {
  constructor(
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

export class WorkDeletionConflict extends Error {
  constructor(
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
  }
}

export async function deletePublicationCompletely(
  publicationId: string,
  expectedPackageId: string,
  actorAccountId?: string,
) {
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
    include: { revisions: { select: { id: true, active: true } } },
  });
  if (!publication) throw new PublicationDeletionConflict("Publicação não encontrada", 404);
  if (publication.packageId !== expectedPackageId) {
    throw new PublicationDeletionConflict("O package_id digitado não corresponde à publicação");
  }
  if ([...activeUploads].some((key) => key.startsWith(`${publication.id}:`))) {
    throw new PublicationDeletionConflict("Há um arquivo deste pacote sendo recebido; aguarde e tente novamente");
  }
  if (["validating", "promoting"].includes(publication.state)) {
    throw new PublicationDeletionConflict("A publicação está sendo finalizada e não pode ser excluída agora");
  }
  const revisionIds = publication.revisions.map((revision) => revision.id);
  if (publication.revisions.some((revision) => revision.active)) {
    throw new PublicationDeletionConflict(
      "Este pacote contém uma revisão ativa. Ative outra revisão antes de excluí-lo.",
    );
  }
  if (revisionIds.length) {
    const [seasonReferences, episodeReferences] = await Promise.all([
      prisma.season.count({ where: { activeRevisionId: { in: revisionIds } } }),
      prisma.episode.count({ where: { activeRevisionId: { in: revisionIds } } }),
    ]);
    if (seasonReferences || episodeReferences) {
      throw new PublicationDeletionConflict(
        "Este pacote ainda é usado pelo catálogo. Ative outra revisão antes de excluí-lo.",
      );
    }
  }

  const sources = [
    { name: "staging", path: safeDataPath("staging", publication.uploadId) },
    { name: "library", path: safeDataPath("library", "publications", publication.id) },
  ];
  const trashRoot = safeDataPath("trash", "publication-deletions", crypto.randomUUID());
  const moved: Array<{ source: string; trash: string }> = [];
  await fs.promises.mkdir(trashRoot, { recursive: true });
  try {
    for (const source of sources) {
      if (!(await directoryExists(source.path))) continue;
      const trash = path.join(trashRoot, source.name);
      await fs.promises.rename(source.path, trash);
      moved.push({ source: source.path, trash });
    }
    await prisma.$transaction(
      async (tx) => {
        await tx.revisionCleanupJob.deleteMany({ where: { publicationId: publication.id } });
        await tx.asset.deleteMany({ where: { publicationId: publication.id } });
        await tx.mediaObject.deleteMany({ where: { publicationId: publication.id } });
        if (actorAccountId) {
          await tx.auditLog.create({
            data: {
              actorAccountId,
              action: "publication.deleted",
              targetType: "publication",
              targetId: publication.packageId,
              beforeValue: jsonValue({
                id: publication.id,
                uploadId: publication.uploadId,
                packageId: publication.packageId,
                state: publication.state,
                totalSizeBytes: publication.totalSizeBytes?.toString() ?? null,
              }),
              afterValue: jsonValue({ deleted: true }),
            },
          });
        }
        await tx.publication.delete({ where: { id: publication.id } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 },
    );
  } catch (error) {
    for (const item of moved.reverse()) {
      if (!(await directoryExists(item.source)) && (await directoryExists(item.trash))) {
        await fs.promises.mkdir(path.dirname(item.source), { recursive: true });
        await fs.promises.rename(item.trash, item.source);
      }
    }
    await fs.promises.rm(trashRoot, { recursive: true, force: true });
    throw error;
  }
  await fs.promises.rm(trashRoot, { recursive: true, force: true }).catch((error) => {
    console.error({ err: error, publicationId }, "publication trash cleanup failed");
  });
  return { deleted: true, publicationId: publication.id, packageId: publication.packageId };
}

export type WorkDeletionState = Awaited<ReturnType<typeof loadWorkDeletionState>>;

export async function loadWorkDeletionState(workId: string) {
  const work = await prisma.work.findUnique({
    where: { id: workId },
    include: {
      _count: { select: { seasons: true, episodes: true } },
      seasons: { select: { id: true, episodes: { select: { id: true } } } },
    },
  });
  if (!work) return null;
  const seasonIds = work.seasons.map((season) => season.id);
  const episodeIds = work.seasons.flatMap((season) =>
    season.episodes.map((episode) => episode.id),
  );
  const publicationWhere: Prisma.PublicationWhereInput = {
    OR: [
      { receipt: { remoteWorkId: work.id } },
      { assets: { some: { workId: work.id } } },
      { mediaObjects: { some: { workId: work.id } } },
      { manifest: { path: ["work", "id"], equals: work.stableId } },
    ],
  };
  const publications = await prisma.publication.findMany({
    where: publicationWhere,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      uploadId: true,
      packageId: true,
      packageType: true,
      state: true,
      totalSizeBytes: true,
      errorMessage: true,
      createdAt: true,
      revisions: {
        select: { id: true, scopeKey: true, number: true, active: true },
      },
      receipt: { select: { status: true } },
      _count: { select: { files: true } },
    },
  });
  const publicationIds = publications.map((publication) => publication.id);
  const pathHints = publicationIds.map((id) =>
    path.join("library", "publications", id),
  );
  const transcodeJobs = pathHints.length
    ? await prisma.transcodeJob.findMany({
        where: {
          OR: pathHints.map((hint) => ({ sourcePath: { contains: hint } })),
        },
        select: { id: true, state: true, outputPath: true, sizeBytes: true },
      })
    : [];
  const assetWhere: Prisma.AssetWhereInput = {
    OR: [
      { workId: work.id },
      { publicationId: { in: publicationIds } },
      { seasonId: { in: seasonIds } },
      { episodeId: { in: episodeIds } },
    ],
  };
  const mediaWhere: Prisma.MediaObjectWhereInput = {
    OR: [
      { workId: work.id },
      { publicationId: { in: publicationIds } },
      { episodeId: { in: episodeIds } },
    ],
  };
  const [
    assets,
    mediaObjects,
    favorites,
    progress,
    collectionItems,
    cleanupJobs,
  ] = await Promise.all([
    prisma.asset.aggregate({ where: assetWhere, _count: { _all: true } }),
    prisma.mediaObject.aggregate({ where: mediaWhere, _count: { _all: true } }),
    prisma.favorite.count({ where: { workId: work.id } }),
    prisma.viewingProgress.count({
      where: { OR: [{ workId: work.id }, { episode: { workId: work.id } }] },
    }),
    prisma.editorialCollectionItem.count({ where: { workId: work.id } }),
    publicationIds.length
      ? prisma.revisionCleanupJob.findMany({
          where: {
            publicationId: { in: publicationIds },
            state: { in: ["queued", "processing"] },
          },
          select: { id: true, state: true, publicationId: true },
        })
      : Promise.resolve([]),
  ]);
  const blockers: string[] = [];
  const unsafePublications = publications.filter((publication) =>
    ["waiting_files", "uploading", "validating", "promoting"].includes(
      publication.state,
    ),
  );
  if (unsafePublications.length) {
    blockers.push(
      `${unsafePublications.length} publicação(ões) em envio ou finalização. Conclua ou exclua esses pacotes antes de apagar a obra.`,
    );
  }
  if (
    [...activeUploads].some((key) =>
      publicationIds.some((id) => key.startsWith(`${id}:`)),
    )
  ) {
    blockers.push(
      "Há arquivos sendo recebidos para esta obra. Aguarde o envio terminar.",
    );
  }
  if (cleanupJobs.length) {
    blockers.push(
      "Há uma limpeza de revisão na fila ou em andamento para esta obra. Aguarde a conclusão.",
    );
  }
  if (
    transcodeJobs.some((job) => ["queued", "processing"].includes(job.state))
  ) {
    blockers.push(
      "Há um transcode na fila ou em processamento para esta obra. Aguarde a conclusão.",
    );
  }
  return {
    work,
    publications,
    transcodeJobs,
    blockers,
    assetWhere,
    mediaWhere,
    counts: {
      seasons: work._count.seasons,
      episodes: work._count.episodes,
      assets: assets._count._all,
      mediaObjects: mediaObjects._count._all,
      favorites,
      progress,
      collectionItems,
      publications: publications.length,
      transcodeJobs: transcodeJobs.length,
      bytes:
        publications.reduce(
          (total, publication) =>
            total + Number(publication.totalSizeBytes ?? 0n),
          0,
        ) +
        transcodeJobs.reduce(
          (total, job) => total + Number(job.sizeBytes ?? 0n),
          0,
        ),
    },
  };
}

export function workDeletionPreview(state: NonNullable<WorkDeletionState>) {
  return {
    work: {
      id: state.work.id,
      stableId: state.work.stableId,
      title: state.work.title.trim(),
      contentKind: state.work.contentKind,
    },
    counts: state.counts,
    blockers: state.blockers,
    canDelete: state.blockers.length === 0,
    publications: state.publications.map((publication) => ({
      id: publication.id,
      packageId: publication.packageId,
      packageType: publication.packageType,
      state: publication.state,
      receiptStatus: publication.receipt?.status ?? null,
      revisions: publication.revisions,
      fileCount: publication._count.files,
      totalSizeBytes: Number(publication.totalSizeBytes ?? 0n),
    })),
    transcodeJobs: state.transcodeJobs.map((job) => ({
      id: job.id,
      state: job.state,
      sizeBytes: Number(job.sizeBytes ?? 0n),
    })),
  };
}

export async function deleteWorkCompletely(
  workId: string,
  expectedTitle: string,
  actorAccountId: string,
) {
  const state = await loadWorkDeletionState(workId);
  if (!state) throw new WorkDeletionConflict("Obra não encontrada", 404);
  if (state.work.title.trim() !== expectedTitle) {
    throw new WorkDeletionConflict(
      "O título digitado não corresponde ao título canônico da obra",
    );
  }
  if (state.blockers.length)
    throw new WorkDeletionConflict(state.blockers.join(" "));

  const publicationIds = state.publications.map(
    (publication) => publication.id,
  );
  const transcodeIds = state.transcodeJobs.map((job) => job.id);
  const dataRoot = path.resolve(env.dataRoot);
  const sources = [
    ...state.publications.flatMap((publication) => [
      safeDataPath("staging", publication.uploadId),
      safeDataPath("library", "publications", publication.id),
    ]),
    ...state.transcodeJobs
      .map((job) => job.outputPath)
      .filter((value) => {
        const target = path.resolve(value);
        return target.startsWith(dataRoot + path.sep);
      }),
  ].filter((value, index, all) => all.indexOf(value) === index);
  const trashRoot = safeDataPath(
    "trash",
    "work-deletions",
    crypto.randomUUID(),
  );
  const moved: Array<{ source: string; trash: string }> = [];
  await fs.promises.mkdir(trashRoot, { recursive: true });
  try {
    for (const [index, source] of sources.entries()) {
      const stat = await fs.promises.stat(source).catch(() => null);
      if (!stat) continue;
      const trash = path.join(trashRoot, `${index}-${path.basename(source)}`);
      await fs.promises.rename(source, trash);
      moved.push({ source, trash });
    }
    await prisma.$transaction(
      async (tx) => {
        if (
          [...activeUploads].some((key) =>
            publicationIds.some((id) => key.startsWith(`${id}:`)),
          )
        ) {
          throw new WorkDeletionConflict(
            "Há arquivos sendo recebidos para esta obra.",
          );
        }
        if (publicationIds.length) {
          const unsafe = await tx.publication.count({
            where: {
              id: { in: publicationIds },
              state: {
                in: ["waiting_files", "uploading", "validating", "promoting"],
              },
            },
          });
          if (unsafe)
            throw new WorkDeletionConflict(
              "Uma publicação desta obra começou a ser enviada ou finalizada.",
            );
          const activeCleanup = await tx.revisionCleanupJob.count({
            where: {
              publicationId: { in: publicationIds },
              state: { in: ["queued", "processing"] },
            },
          });
          if (activeCleanup)
            throw new WorkDeletionConflict(
              "Uma limpeza de revisão desta obra começou a ser processada.",
            );
          await tx.revisionCleanupJob.deleteMany({
            where: { publicationId: { in: publicationIds } },
          });
          await tx.asset.deleteMany({ where: state.assetWhere });
          await tx.mediaObject.deleteMany({ where: state.mediaWhere });
          await tx.publication.deleteMany({
            where: { id: { in: publicationIds } },
          });
        } else {
          await tx.asset.deleteMany({ where: state.assetWhere });
          await tx.mediaObject.deleteMany({ where: state.mediaWhere });
        }
        if (transcodeIds.length) {
          const activeTranscode = await tx.transcodeJob.count({
            where: {
              id: { in: transcodeIds },
              state: { in: ["queued", "processing"] },
            },
          });
          if (activeTranscode)
            throw new WorkDeletionConflict(
              "Um transcode desta obra começou a ser processado.",
            );
          await tx.transcodeJob.deleteMany({
            where: { id: { in: transcodeIds } },
          });
        }
        await tx.auditLog.create({
          data: {
            actorAccountId,
            action: "work.deleted",
            targetType: "work",
            targetId: state.work.stableId,
            beforeValue: jsonValue({
              id: state.work.id,
              stableId: state.work.stableId,
              title: state.work.title,
              contentKind: state.work.contentKind,
              counts: state.counts,
              publications: state.publications.map((publication) => ({
                id: publication.id,
                packageId: publication.packageId,
                packageType: publication.packageType,
              })),
            }),
            afterValue: jsonValue({ deleted: true }),
          },
        });
        await tx.work.delete({ where: { id: state.work.id } });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 60_000,
      },
    );
  } catch (error) {
    for (const item of moved.reverse()) {
      const stillMissing = !(await fs.promises
        .stat(item.source)
        .catch(() => null));
      if (stillMissing) {
        await fs.promises.mkdir(path.dirname(item.source), { recursive: true });
        await fs.promises
          .rename(item.trash, item.source)
          .catch(() => undefined);
      }
    }
    await fs.promises
      .rm(trashRoot, { recursive: true, force: true })
      .catch(() => undefined);
    throw error;
  }
  await fs.promises
    .rm(trashRoot, { recursive: true, force: true })
    .catch((error) => {
      console.error(
        { err: error, workId },
        "work deletion trash cleanup failed",
      );
    });
  return {
    deleted: true,
    workId: state.work.id,
    stableId: state.work.stableId,
    title: state.work.title,
    counts: state.counts,
    publicationIds,
  };
}
