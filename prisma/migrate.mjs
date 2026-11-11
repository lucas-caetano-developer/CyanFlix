import { execSync } from "node:child_process";

console.log("=== [CyanFlix Migrate] Iniciando migrações do banco de dados ===");

const failedCandidates = [
  "20261111000100_remove_credits_metadata",
  "20261111000200_voice_actors"
];

for (const migration of failedCandidates) {
  try {
    execSync(`npx prisma migrate resolve --rolled-back "${migration}"`, {
      stdio: "pipe",
      env: process.env,
    });
    console.log(`[CyanFlix Migrate] Migração ${migration} destravada (marcada como rolled-back para reaplicação segura).`);
  } catch {
    // Não estava em estado falhado, ignorar
  }
}

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
