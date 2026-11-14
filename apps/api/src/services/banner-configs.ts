import fs from "node:fs";
import path from "node:path";
import { prisma } from "@cyanflix/database";
import { env } from "../lib/config.js";
import { jsonValue } from "../lib/mappers.js";

export interface BannerCustomState {
  logoPosition: "left" | "right";
  customColor?: string;
  flipHorizontal?: boolean;
  characterOffsetX: number;
  characterOffsetY: number;
  characterScale: number;
  tagline?: string;
}

export type BannerCustomStatesMap = Record<string, BannerCustomState>;

const bannerConfigsFile = path.join(env.dataRoot, "banner_configs.json");

let cachedBannerConfigs: BannerCustomStatesMap | null = null;
let lastBannerConfigsCacheTime = 0;
const CACHE_TTL_MS = 15_000;

export async function getStoredBannerConfigs(): Promise<BannerCustomStatesMap> {
  const now = Date.now();
  if (cachedBannerConfigs && now - lastBannerConfigsCacheTime < CACHE_TTL_MS) {
    return cachedBannerConfigs;
  }

  // 1. Try PostgreSQL
  try {
    const col = await prisma.editorialCollection.findUnique({
      where: { slug: "__cyanflix_banner_configs__" },
    });
    if (col && col.metadata && typeof col.metadata === "object") {
      cachedBannerConfigs = col.metadata as unknown as BannerCustomStatesMap;
      lastBannerConfigsCacheTime = now;
      return cachedBannerConfigs;
    }
  } catch (err) {
    console.warn({ err }, "Erro ao carregar configurações de banners do PostgreSQL");
  }

  // 2. Try disk file fallback
  try {
    if (fs.existsSync(bannerConfigsFile)) {
      const parsed = JSON.parse(
        fs.readFileSync(bannerConfigsFile, "utf-8")
      ) as BannerCustomStatesMap;
      if (parsed && typeof parsed === "object") {
        cachedBannerConfigs = parsed;
        lastBannerConfigsCacheTime = now;
        return cachedBannerConfigs;
      }
    }
  } catch (err) {
    console.warn({ err }, "Erro ao ler banner_configs.json");
  }

  cachedBannerConfigs = {};
  lastBannerConfigsCacheTime = now;
  return cachedBannerConfigs;
}

export async function saveStoredBannerConfigs(
  configs: BannerCustomStatesMap
): Promise<void> {
  cachedBannerConfigs = configs;
  lastBannerConfigsCacheTime = Date.now();

  // 1. Save to PostgreSQL
  try {
    await prisma.editorialCollection.upsert({
      where: { slug: "__cyanflix_banner_configs__" },
      create: {
        slug: "__cyanflix_banner_configs__",
        title: "Configurações de Banners Promocionais",
        state: "system",
        active: false,
        metadata: jsonValue(configs),
        createdByAccountId: "system",
        updatedByAccountId: "system",
      },
      update: {
        metadata: jsonValue(configs),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error({ err }, "Erro ao salvar configurações de banners no PostgreSQL");
  }

  // 2. Save to disk file fallback
  try {
    fs.mkdirSync(env.dataRoot, { recursive: true });
    fs.writeFileSync(bannerConfigsFile, JSON.stringify(configs, null, 2), "utf-8");
  } catch (err) {
    console.warn(
      { err },
      "Aviso: não foi possível gravar banner_configs.json no disco (usando PostgreSQL)"
    );
  }
}
