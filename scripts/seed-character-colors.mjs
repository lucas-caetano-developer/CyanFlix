import { PrismaClient } from "@prisma/client";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const CHARACTER_COLOR_PALETTES = {
  "pomni": "#E11D48",
  "jax": "#9333EA",
  "ragatha": "#EA580C",
  "gangle": "#F43F5E",
  "kinger": "#3B82F6",
  "zooble": "#F59E0B",
  "caine": "#EF4444",
  "bolha": "#06B6D4",
  "kaufmo": "#A855F7",
  "queenie": "#EC4899",
  "gummigoo": "#F97316",
  "mindo": "#3B82F6",
  "o cara que desaparece": "#64748B",
  "sol": "#EAB308",
  "lua": "#38BDF8",
  "rainha gloink": "#84CC16",
  "max": "#F59E0B",
  "chad": "#0284C7",
  "princesa loolilalu": "#FB7185",
  "barão teodoro mildenhall": "#10B981",
  "martha mildenhall": "#14B8A6",
  "fantasminha": "#00D4FF",
  "vi (violet)": "#E11D48",
  "jinx (powder)": "#00D4FF",
  "caitlyn kiramman": "#2563EB",
  "jayce talis": "#3B82F6",
  "viktor": "#D97706",
  "ekko": "#10B981",
  "mel medarda": "#CA8A04",
  "silco": "#7C3AED",
  "vander": "#78350F",
  "sevika": "#475569",
  "benzo": "#854D0E",
  "mylo": "#64748B",
  "claggor": "#B45309",
  "huck": "#0284C7",
  "finn": "#F59E0B",
  "renni": "#DC2626",
  "smeech": "#65A30D",
  "margot": "#9333EA",
  "heimerdinger": "#FBBF24",
  "marcus": "#475569",
  "grayson": "#1E3A8A",
  "cassandra kiramman": "#1E40AF",
  "tobias kiramman": "#4338CA",
  "hoskel": "#78350F",
  "salo": "#854D0E",
  "shoola": "#A855F7",
  "bolbok": "#0D9488",
  "elora": "#E11D48",
  "ambessa medarda": "#991B1B",
  "rictus": "#7F1D1D",
  "amara": "#B45309",
  "leblanc": "#6B21A8",
  "maddie nolen": "#0284C7",
  "loris": "#475569",
  "isha": "#38BDF8",
  "steb": "#059669",
  "chross": "#D97706",
  "líder tatuado": "#DC2626",
  "sky young": "#F472B6",
  "ximena talis": "#F59E0B",
  "ren": "#EC4899",
  "babette": "#BE185D",
  "thieram": "#64748B",
  "verne": "#0284C7",
  "jules": "#10B981",
  "deckard": "#A855F7",
  "harold": "#475569",
  "crafter": "#0EA5E9",
  "supervisor": "#E11D48",
  "boticário": "#059669",
  "tanjiro kamado": "#10B981",
  "zenitsu agatsuma": "#FBBF24",
  "inosuke hashibira": "#0284C7",
  "nezuko kamado": "#F472B6",
  "kanao tsuyuri": "#FB7185",
  "genya shinazugawa": "#9333EA",
  "giyu tomioka — hashira da água": "#2563EB",
  "shinobu kocho — hashira dos insetos": "#A855F7",
  "muichiro tokito — hashira da névoa": "#14B8A6",
  "sanemi shinazugawa — hashira do vento": "#84CC16",
  "obanai iguro — hashira da serpente": "#475569",
  "mitsuri kanroji — hashira do amor": "#FB7185",
  "gyomei himejima — hashira da rocha": "#78716C",
  "tengen uzui — ex-hashira do som": "#EC4899",
  "muzan kibutsuji": "#DC2626",
  "akaza — lua superior três": "#DB2777",
  "doma — lua superior dois": "#F87171",
  "kaigaku — lua superior seis": "#7E22CE",
  "kokushibo — lua superior um": "#6B21A8",
  "yushiro": "#14B8A6",
  "tamayo": "#7C3AED",
  "murata": "#64748B",
  "kagaya ubuyashiki": "#8B5CF6",
  "kiriya ubuyashiki": "#9333EA",
  "kanata ubuyashiki": "#C084FC",
  "kuina ubuyashiki": "#E879F9",
  "sakonji urokodaki": "#0284C7",
  "hakuji (akaza humano)": "#E11D48",
  "keizo": "#D97706",
  "koyuki": "#38BDF8",
  "kanae kocho": "#F472B6",
  "jigoro kuwajima": "#EAB308",
  "tanjuro kamado": "#EA580C",
  "shinjuro rengoku": "#C2410C",
  "pais de doma": "#991B1B",
  "pai de akaza": "#64748B",
  "matsuemon tennoji": "#1E293B",
  "frieren": "#38BDF8",
  "fern": "#8B5CF6",
  "stark": "#EF4444",
  "himmel": "#0EA5E9",
  "heiter": "#10B981",
  "eisen": "#78716C",
  "flamme": "#F97316",
  "denken": "#D97706",
  "übel": "#059669",
  "land": "#475569",
  "wirbel": "#0284C7",
  "ehre": "#EC4899",
  "scharf": "#64748B",
  "richter": "#B45309",
  "laufen": "#EA580C",
  "methode": "#7C3AED",
  "sense": "#A855F7",
  "genau": "#334155",
  "serie": "#EAB308",
  "kanne": "#06B6D4",
  "lawine": "#67E8F9",
  "edel": "#9333EA",
  "aura, a guilhotina": "#7E22CE",
  "lügner": "#B91C1C",
  "linie": "#F43F5E",
  "draht": "#475569",
  "qual": "#1E1B4B",
  "rei demônio": "#DC2626",
  "sein": "#0D9488",
  "kraft": "#84CC16",
  "heiter (jovem)": "#10B981",
  "himmel (jovem)": "#38BDF8",
  "yuji itadori": "#EF4444",
  "megumi fushiguro": "#1E3A8A",
  "nobara kugisaki": "#F97316",
  "satoru gojo": "#0284C7",
  "ryomen sukuna": "#B91C1C",
  "kinji hakari": "#10B981",
  "kirara hoshi": "#EC4899",
  "masamichi yaga": "#78350F",
  "shoko ieiri": "#0D9488",
  "kiyotaka ijichi": "#475569",
  "akari nitta": "#F59E0B",
  "atsuya kusakabe": "#78716C",
  "aoi todo": "#854D0E",
  "noritoshi kamo": "#991B1B",
  "momo nishimiya": "#EAB308",
  "mai zenin": "#059669",
  "kasumi miwa": "#38BDF8",
  "kokichi muta (mechamaru)": "#64748B",
  "utahime iori": "#E11D48",
  "yoshinobu gakuganji": "#A855F7",
  "mei mei": "#8B5CF6",
  "takuma ino": "#1E293B",
  "yuki tsukumo": "#CA8A04",
  "ui ui": "#6366F1",
  "yu haibara": "#F97316",
  "suguru geto": "#475569",
  "suguru geto / kenjaku": "#334155",
  "mahito": "#06B6D4",
  "jogo": "#EA580C",
  "hanami": "#15803D",
  "dagon": "#0284C7",
  "choso": "#991B1B",
  "eso": "#7C3AED",
  "kechizu": "#65A30D",
  "uraume": "#93C5FD",
  "haruta shigemo": "#FBBF24",
  "juzo kumiya": "#78350F",
  "jiro awasaka": "#475569",
  "ogami": "#7E22CE",
  "junpei yoshino": "#0D9488",
  "toji fushiguro": "#334155",
  "riko amanai": "#38BDF8",
  "misato kuroi": "#0284C7",
  "shiu kong": "#B45309",
  "larue": "#EC4899",
  "nanako hasaba": "#F472B6",
  "mimiko hasaba": "#64748B",
  "manami suda": "#CA8A04",
  "hiromi higuruma": "#78350F",
  "fumihiko takaba": "#F59E0B",
  "hajime kashimo": "#00D4FF",
  "reggie star": "#EAB308",
  "remi": "#EC4899",
  "rin amai": "#F97316",
  "iori hazenoki": "#DC2626",
  "ryū ishigori": "#EA580C",
  "takako uro": "#38BDF8",
  "tengen": "#14B8A6",
  "kogane": "#EAB308",
  "kurourushi": "#78350F",
  "naobito zenin": "#854D0E",
  "naoya zenin": "#D97706",
  "ogi zenin": "#991B1B",
  "jinichi zenin": "#334155",
  "ranta zenin": "#475569",
  "chojuro zenin": "#64748B",
  "mãe de maki e mai": "#059669",
  "rika orimoto": "#9333EA",
  "tsumiki fushiguro": "#38BDF8",
  "wasuke itadori": "#78716C",
  "jin itadori": "#D97706",
  "kaori itadori": "#7C3AED",
  "yuko ozawa": "#FB7185",
  "nobuko takada": "#EC4899",
  "yuta okkotsu": "#64748B",
  "maki zenin": "#059669",
  "toge inumaki": "#6366F1",
  "panda": "#0F172A",
  "kento nanami": "#EAB308",
  "miguel oduol": "#2563EB",
  "rika orimoto (criança)": "#F472B6",
  "yuta okkotsu (criança)": "#38BDF8",
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
