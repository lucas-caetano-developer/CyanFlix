import { PrismaClient } from "@prisma/client";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CHARACTER_COLOR_PALETTES = {
  pomni: "#E11D48",
  jax: "#9333EA",
  ragatha: "#EA580C",
  gangle: "#F43F5E",
  kinger: "#3B82F6",
  zooble: "#F59E0B",
  caine: "#EF4444",
  bubble: "#06B6D4",
  vi: "#E11D48",
  jinx: "#06B6D4",
  caitlyn: "#2563EB",
  silco: "#7C3AED",
  viktor: "#D97706",
  jayce: "#3B82F6",
  ekko: "#10B981",
  mel: "#CA8A04",
  heimerdinger: "#F59E0B",
  vander: "#78350F",
  warwick: "#991B1B",
  sevika: "#475569",
  singed: "#059669",
  tanjiro: "#10B981",
  "tanjiro kamado": "#10B981",
  nezuko: "#F472B6",
  "nezuko kamado": "#F472B6",
  zenitsu: "#FBBF24",
  "zenitsu agatsuma": "#FBBF24",
  inosuke: "#0284C7",
  "inosuke hashibira": "#0284C7",
  rengoku: "#EA580C",
  "kyojuro rengoku": "#EA580C",
  giyu: "#2563EB",
  "giyu tomioka": "#2563EB",
  shinobu: "#A855F7",
  "shinobu kocho": "#A855F7",
  tengen: "#EC4899",
  "tengen uzui": "#EC4899",
  muichiro: "#14B8A6",
  "muichiro tokito": "#14B8A6",
  mitsuri: "#FB7185",
  "mitsuri kanroji": "#FB7185",
  sanemi: "#84CC16",
  "sanemi shinazugawa": "#84CC16",
  gyomei: "#78716C",
  "gyomei himejima": "#78716C",
  obanai: "#475569",
  "obanai iguro": "#475569",
  muzan: "#DC2626",
  "muzan kibutsuji": "#DC2626",
  akaza: "#DB2777",
  doma: "#F87171",
  kokushibo: "#7E22CE",
  frieren: "#38BDF8",
  fern: "#8B5CF6",
  stark: "#EF4444",
  himmel: "#0EA5E9",
  heiter: "#10B981",
  eisen: "#78716C",
  flamme: "#F97316",
  serie: "#EAB308",
  aura: "#9333EA",
  "yuji itadori": "#EF4444",
  itadori: "#EF4444",
  "megumi fushiguro": "#1E3A8A",
  fushiguro: "#1E3A8A",
  "nobara kugisaki": "#F97316",
  nobara: "#F97316",
  "satoru gojo": "#0284C7",
  gojo: "#0284C7",
  "suguru geto": "#475569",
  geto: "#475569",
  "ryomen sukuna": "#B91C1C",
  sukuna: "#B91C1C",
  "yuta okkotsu": "#64748B",
  yuta: "#64748B",
  "maki zenin": "#059669",
  maki: "#059669",
  "toge inumaki": "#6366F1",
  inumaki: "#6366F1",
  panda: "#0F172A",
  "kento nanami": "#EAB308",
  nanami: "#EAB308",
  "aoi todo": "#854D0E",
  todo: "#854D0E",
  mahito: "#06B6D4",
  jogo: "#EA580C",
  hanami: "#15803D",
  dagon: "#0284C7",
  choso: "#991B1B",
  toji: "#334155",
  "toji fushiguro": "#334155",
  shigaraki: "#475569",
  "tomura shigaraki": "#475569",
  deku: "#059669",
  "izuku midoriya": "#059669",
  bakugo: "#EA580C",
  "katsuki bakugo": "#EA580C",
  todoroki: "#EF4444",
  "shoto todoroki": "#EF4444",
  "all might": "#2563EB",
  dabi: "#2563EB",
  toga: "#F43F5E",
  "himiko toga": "#F43F5E",
};

export function resolveCharacterThemeColor(name, role) {
  const cleanName = (name || "").toLowerCase().trim();
  if (CHARACTER_COLOR_PALETTES[cleanName]) return CHARACTER_COLOR_PALETTES[cleanName];
  for (const [key, color] of Object.entries(CHARACTER_COLOR_PALETTES)) {
    if (cleanName.includes(key) || key.includes(cleanName)) return color;
  }
  const cleanRole = (role || "").toLowerCase();
  if (cleanRole.includes("vil") || cleanRole.includes("antagonista")) return "#DC2626";
  if (cleanRole.includes("protag")) return "#0284C7";
  if (cleanRole.includes("coadj") || cleanRole.includes("apoio")) return "#8B5CF6";
  const colors = ["#0284C7", "#059669", "#7C3AED", "#E11D48", "#D97706", "#2563EB", "#DB2777", "#10B981"];
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

async function runDirectPrisma() {
  console.log("=== [CyanFlix] Atualizando cores de tema dos personagens via Prisma ===");
  const prisma = new PrismaClient();
  try {
    const characters = await prisma.character.findMany({
      select: { id: true, name: true, role: true, themeColor: true }
    });
    console.log(`Encontrados ${characters.length} personagens no banco de dados.`);
    let updatedCount = 0;
    for (const char of characters) {
      const targetColor = resolveCharacterThemeColor(char.name, char.role);
      if (!char.themeColor || char.themeColor !== targetColor) {
        await prisma.character.update({
          where: { id: char.id },
          data: { themeColor: targetColor },
        });
        console.log(`✓ ${char.name} (${char.role || "Sem papel"}) -> ${targetColor}`);
        updatedCount++;
      } else {
        console.log(`- ${char.name}: já possui cor tema ${char.themeColor}`);
      }
    }
    console.log(`\n=== Sucesso! ${updatedCount} personagens tiveram sua cor de tema atualizada ===\n`);
  } finally {
    await prisma.$disconnect();
  }
}

async function runHttpApi(baseUrl, username, password) {
  console.log(`=== [CyanFlix] Atualizando cores via HTTP API em ${baseUrl} ===`);
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!loginRes.ok) throw new Error(`Falha no login: HTTP ${loginRes.status}`);
  const authCookies = loginRes.headers.get("set-cookie") || "";
  const tokenHeader = loginRes.headers.get("authorization");

  const headers = { "Content-Type": "application/json" };
  if (authCookies) headers["Cookie"] = authCookies;
  if (tokenHeader) headers["Authorization"] = tokenHeader;

  const charsRes = await fetch(`${baseUrl}/api/admin/characters`, { headers });
  if (!charsRes.ok) throw new Error(`Falha ao buscar personagens: HTTP ${charsRes.status}`);
  const characters = await charsRes.json();
  console.log(`Encontrados ${characters.length} personagens.`);

  let updatedCount = 0;
  for (const char of characters) {
    const targetColor = resolveCharacterThemeColor(char.name, char.role);
    if (!char.themeColor || char.themeColor !== targetColor) {
      const patchRes = await fetch(`${baseUrl}/api/admin/characters/${char.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ themeColor: targetColor }),
      });
      if (patchRes.ok) {
        console.log(`✓ ${char.name} -> ${targetColor}`);
        updatedCount++;
      } else {
        console.warn(`! Falha ao atualizar ${char.name}: ${patchRes.status}`);
      }
    }
  }
  console.log(`\n=== Concluído! ${updatedCount} personagens atualizados ===\n`);
}

async function main() {
  if (process.env.DATABASE_URL) {
    await runDirectPrisma();
  } else {
    const baseUrl = process.argv[2] || process.env.APP_URL || "https://cyanflix.icyan.com";
    const username = process.argv[3] || process.env.ADMIN_USER || "cyan@admin.com";
    const password = process.argv[4] || process.env.ADMIN_PASSWORD || "42421216";
    try {
      await runHttpApi(baseUrl, username, password);
    } catch (err) {
      console.warn("Aviso via HTTP API:", err.message);
      console.log("Tentando conexão Prisma local...");
      await runDirectPrisma();
    }
  }
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
