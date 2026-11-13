import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

console.log("=== [CyanFlix Migrate] Iniciando migrações do banco de dados ===");

try {
  console.log("[CyanFlix Migrate] Executando prisma migrate deploy...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
  console.log("=== [CyanFlix Migrate] Migrações concluídas com sucesso! ===");
} catch (error) {
  console.error("[CyanFlix Migrate] Erro crítico ao executar prisma migrate deploy:", error);
  process.exit(1);
}

const ROLES = [
  "Protagonista",
  "Coprotagonista",
  "Deuteragonista",
  "Tritagonista",
  "Antagonista",
  "Coadjuvante",
  "Secundário",
  "Recorrente",
  "Participação Especial",
  "Convidado",
  "Narrador",
  "Figurante",
  "Ponta / Extra",
];

function resolveCharacterRole(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  const normalized = trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const found = ROLES.find(
    (r) => r.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === normalized
  );
  return found || trimmed;
}

async function normalizeCharacterRoles() {
  console.log("[CyanFlix Migrate] Verificando normalização de papéis de personagens...");
  const prisma = new PrismaClient();
  try {
    const characters = await prisma.character.findMany({
      where: { role: { not: null } },
      select: { id: true, role: true, name: true },
    });

    let updatedCount = 0;
    for (const char of characters) {
      const resolved = resolveCharacterRole(char.role);
      if (resolved && resolved !== char.role) {
        await prisma.character.update({
          where: { id: char.id },
          data: { role: resolved },
        });
        console.log(`[CyanFlix Migrate] Normalizado papel do personagem "${char.name}": "${char.role}" -> "${resolved}"`);
        updatedCount++;
      }
    }
    if (updatedCount > 0) {
      console.log(`[CyanFlix Migrate] Total de ${updatedCount} personagem(ns) normalizado(s).`);
    } else {
      console.log("[CyanFlix Migrate] Todos os papéis de personagens já estão devidamente normalizados.");
    }
  } catch (error) {
    console.warn("[CyanFlix Migrate] Aviso ao verificar papéis de personagens:", error?.message || error);
  } finally {
    await prisma.$disconnect();
  }
}

await normalizeCharacterRoles();
