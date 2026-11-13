import { readNestedArray, readObject, type WorkCardDto, toPresentationAssetDto, toWorkCardDto } from "./mappers.js";

export function catalogAvailability(work: WorkCardDto): string {
  return work.seasons
    .map((season) => readObject(season.metadata).media_availability)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toUpperCase();
}
export function recommendationTokens(value: unknown): string[] {
  const metadata = readObject(value);
  const nested = [readObject(metadata.anilist), readObject(metadata.tmdb)];
  const values = [
    metadata.genres,
    metadata.keywords,
    metadata.tags,
    metadata.studios,
    ...nested.flatMap((entry) => [
      entry.genres,
      entry.keywords,
      entry.tags,
      entry.studios,
    ]),
  ];
  return values
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map((entry) =>
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry
          ? String((entry as Record<string, unknown>).name ?? "")
          : "",
    )
    .map((entry) => entry.trim().toLocaleLowerCase("pt-BR"))
    .filter(Boolean);
}
export function recommendationScore(
  work: ReturnType<typeof toWorkCardDto>,
  taste: string[],
  seedKinds: Array<"movie" | "series" | "anime">,
): number {
  const preferences = new Map<string, number>();
  for (const token of taste)
    preferences.set(token, (preferences.get(token) ?? 0) + 1);
  const metadataScore = recommendationTokens(work.metadata).reduce(
    (score, token) => score + (preferences.get(token) ?? 0),
    0,
  );
  const kindScore =
    seedKinds.filter((kind) => kind === work.contentKind).length >
    seedKinds.length / 2
      ? 1
      : 0;
  return metadataScore * 3 + kindScore + (work.featured ? 1 : 0);
}
export function preferredPresentationAssets<T extends { id: string }>(
  assets: T[],
  metadata: Record<string, unknown>,
): T[] {
  const preferred = new Set(
    Object.values(readObject(metadata.preferred_assets)).filter(
      (value): value is string => typeof value === "string",
    ),
  );
  return [...assets].sort(
    (left, right) =>
      Number(preferred.has(right.id)) - Number(preferred.has(left.id)),
  );
}
export function manifestAssetMap(value: unknown): Map<string, string> {
  const manifest = readObject(value);
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const output = new Map<string, string>();
  for (const entry of assets) {
    const asset = readObject(entry);
    if (typeof asset.path === "string")
      output.set(
        asset.path,
        typeof asset.sha256 === "string"
          ? asset.sha256
          : `${asset.size_bytes ?? ""}`,
      );
  }
  return output;
}
export function catalogGenreRows(works: Array<ReturnType<typeof toWorkCardDto>>) {
  const genres = new Map<
    string,
    { label: string; items: Array<ReturnType<typeof toWorkCardDto>> }
  >();
  for (const work of works) {
    const metadata = readObject(work.metadata);
    const direct = Array.isArray(metadata.genres) ? metadata.genres : [];
    const anilist = readObject(metadata.anilist);
    const nested = Array.isArray(anilist.genres) ? anilist.genres : [];
    for (const value of [...direct, ...nested]) {
      if (typeof value !== "string" || !value.trim()) continue;
      const key = value.trim().toLocaleLowerCase("pt-BR");
      const group = genres.get(key) ?? { label: value.trim(), items: [] };
      if (!group.items.some((item) => item.id === work.id))
        group.items.push(work);
      genres.set(key, group);
    }
  }
  return Array.from(genres.entries())
    .sort(
      (left, right) =>
        right[1].items.length - left[1].items.length ||
        left[1].label.localeCompare(right[1].label, "pt-BR"),
    )
    .slice(0, 8)
    .map(([key, group]) => ({
      id: `genre:${key}`,
      title: group.label,
      items: group.items,
    }));
}
