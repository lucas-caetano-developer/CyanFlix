import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { toJson } from "../../lib/mappers.js";

export async function adminIntegrityRoutes(app: FastifyInstance) {
  app.get("/api/admin/integrity", async () =>
    toJson(
      await prisma.integrityCheck.findMany({
        orderBy: { startedAt: "desc" },
        take: 20,
        select: {
          id: true,
          state: true,
          checkedAssets: true,
          hashedAssets: true,
          missingAssets: true,
          corruptAssets: true,
          startedAt: true,
          completedAt: true,
        },
      }),
    ),
  );
}
