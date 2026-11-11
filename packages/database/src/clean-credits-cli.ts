import { cleanCreditsInDatabase, prisma } from "./index.js";

async function main() {
  console.log("Iniciando limpeza de metadados de elenco e equipe no banco de dados...");
  try {
    await cleanCreditsInDatabase(prisma);
    console.log("Limpeza concluída com sucesso em Work, Season, Episode, EditorialOverride e searchText!");
  } catch (err) {
    console.error("Erro durante a limpeza:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
