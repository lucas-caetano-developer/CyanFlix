import fs from "node:fs";
import path from "node:path";
import { prisma } from "@cyanflix/database";
import { env } from "../lib/config.js";
import { jsonValue } from "../lib/mappers.js";


export interface HomeSectionConfig {
  id: string;
  title: string;
  defaultTitle: string;
  enabled: boolean;
  type: "system" | "genre" | "collection";
  sortOrder: number;
}

export const DEFAULT_HOME_SECTIONS: HomeSectionConfig[] = [
  {
    id: "featured",
    title: "Destaques",
    defaultTitle: "Destaques",
    enabled: true,
    type: "system",
    sortOrder: 0,
  },
  {
    id: "popular",
    title: "Mais assistidos",
    defaultTitle: "Mais assistidos",
    enabled: true,
    type: "system",
    sortOrder: 1,
  },
  {
    id: "recent",
    title: "Adicionados recentemente",
    defaultTitle: "Adicionados recentemente",
    enabled: true,
    type: "system",
    sortOrder: 2,
  },
  {
    id: "anime",
    title: "Animes",
    defaultTitle: "Animes",
    enabled: true,
    type: "system",
    sortOrder: 3,
  },
  {
    id: "genre:action",
    title: "Ação",
    defaultTitle: "Ação",
    enabled: true,
    type: "genre",
    sortOrder: 4,
  },
  {
    id: "movies",
    title: "Filmes",
    defaultTitle: "Filmes",
    enabled: true,
    type: "system",
    sortOrder: 5,
  },
  {
    id: "series",
    title: "Séries",
    defaultTitle: "Séries",
    enabled: true,
    type: "system",
    sortOrder: 6,
  },
  {
    id: "genre:comedy",
    title: "Comédia",
    defaultTitle: "Comédia",
    enabled: true,
    type: "genre",
    sortOrder: 7,
  },
  {
    id: "genre:drama",
    title: "Drama",
    defaultTitle: "Drama",
    enabled: true,
    type: "genre",
    sortOrder: 8,
  },
  {
    id: "genre:scifi",
    title: "Ficção Científica",
    defaultTitle: "Ficção Científica",
    enabled: true,
    type: "genre",
    sortOrder: 9,
  },
  {
    id: "genre:thriller",
    title: "Suspense e Terror",
    defaultTitle: "Suspense e Terror",
    enabled: true,
    type: "genre",
    sortOrder: 10,
  },
  {
    id: "genre:animation",
    title: "Animação",
    defaultTitle: "Animação",
    enabled: true,
    type: "genre",
    sortOrder: 11,
  },
  {
    id: "dubbed",
    title: "Dublado",
    defaultTitle: "Dublado",
    enabled: true,
    type: "system",
    sortOrder: 12,
  },
  {
    id: "subtitled",
    title: "Legendado",
    defaultTitle: "Legendado",
    enabled: true,
    type: "system",
    sortOrder: 13,
  },
  {
    id: "recommended",
    title: "Para você",
    defaultTitle: "Para você",
    enabled: true,
    type: "system",
    sortOrder: 14,
  },
];

const homeSectionsFile = path.join(env.dataRoot, "home_sections.json");
let cachedHomeSections: HomeSectionConfig[] | null = null;
let lastHomeSectionsCacheTime = 0;

export async function getStoredHomeSections(): Promise<HomeSectionConfig[]> {
  const now = Date.now();
  if (
    cachedHomeSections &&
    cachedHomeSections.length > 0 &&
    now - lastHomeSectionsCacheTime < 10_000
  ) {
    return cachedHomeSections;
  }

  // 1. Try PostgreSQL first
  try {
    const col = await prisma.editorialCollection.findUnique({
      where: { slug: "__cyanflix_home_sections__" },
    });
    if (col && Array.isArray(col.metadata) && col.metadata.length > 0) {
      const parsed = col.metadata as unknown as HomeSectionConfig[];
      const existingIds = new Set(parsed.map((s) => s.id));
      const merged = [...parsed];
      for (const def of DEFAULT_HOME_SECTIONS) {
        if (!existingIds.has(def.id)) {
          merged.push({ ...def, sortOrder: merged.length });
        }
      }
      cachedHomeSections = merged.sort((a, b) => a.sortOrder - b.sortOrder);
      lastHomeSectionsCacheTime = now;
      return cachedHomeSections;
    }
  } catch (err) {
    console.warn({ err }, "Erro ao carregar seções da home do PostgreSQL");
  }

  // 2. Try disk file fallback
  try {
    if (fs.existsSync(homeSectionsFile)) {
      const parsed = JSON.parse(
        fs.readFileSync(homeSectionsFile, "utf-8"),
      ) as HomeSectionConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingIds = new Set(parsed.map((s) => s.id));
        const merged = [...parsed];
        for (const def of DEFAULT_HOME_SECTIONS) {
          if (!existingIds.has(def.id)) {
            merged.push({ ...def, sortOrder: merged.length });
          }
        }
        cachedHomeSections = merged.sort((a, b) => a.sortOrder - b.sortOrder);
        lastHomeSectionsCacheTime = now;
        return cachedHomeSections;
      }
    }
  } catch (err) {
    console.warn({ err }, "Erro ao ler home_sections.json");
  }

  cachedHomeSections = [...DEFAULT_HOME_SECTIONS];
  lastHomeSectionsCacheTime = now;
  return cachedHomeSections;
}

export async function saveStoredHomeSections(
  sections: HomeSectionConfig[],
): Promise<void> {
  cachedHomeSections = sections;
  lastHomeSectionsCacheTime = Date.now();

  // 1. Save to PostgreSQL
  try {
    await prisma.editorialCollection.upsert({
      where: { slug: "__cyanflix_home_sections__" },
      create: {
        slug: "__cyanflix_home_sections__",
        title: "Configuração de Seções da Home",
        state: "system",
        active: false,
        metadata: jsonValue(sections),
        createdByAccountId: "system",
        updatedByAccountId: "system",
      },
      update: {
        metadata: jsonValue(sections),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error({ err }, "Erro ao salvar seções da home no PostgreSQL");
  }

  // 2. Save to file fallback (non-blocking if permission denied)
  try {
    fs.mkdirSync(env.dataRoot, { recursive: true });
    fs.writeFileSync(
      homeSectionsFile,
      JSON.stringify(sections, null, 2),
      "utf-8",
    );
  } catch (err) {
    console.warn(
      { err },
      "Aviso: não foi possível gravar home_sections.json no disco (usando PostgreSQL)",
    );
  }
}

