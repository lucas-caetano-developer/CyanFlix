import { execSync } from "node:child_process";

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
