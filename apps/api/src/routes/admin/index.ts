import type { FastifyInstance } from "fastify";
import { adminOverviewRoutes } from "./overview.js";
import { adminCatalogRoutes } from "./catalog.js";
import { adminVoiceActorsRoutes } from "./voice-actors.js";
import { adminCharactersRoutes } from "./characters.js";
import { adminCollectionsRoutes } from "./collections.js";
import { adminAccountsRoutes } from "./accounts.js";
import { adminHomeSectionsRoutes } from "./home-sections.js";
import { adminRevisionsRoutes } from "./revisions.js";
import { adminPublicationsRoutes } from "./publications.js";
import { adminIntegrityRoutes } from "./integrity.js";
import { adminBannersRoutes } from "./banners.js";

export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminOverviewRoutes);
  await app.register(adminCatalogRoutes);
  await app.register(adminVoiceActorsRoutes);
  await app.register(adminCharactersRoutes);
  await app.register(adminCollectionsRoutes);
  await app.register(adminAccountsRoutes);
  await app.register(adminHomeSectionsRoutes);
  await app.register(adminRevisionsRoutes);
  await app.register(adminPublicationsRoutes);
  await app.register(adminIntegrityRoutes);
  await app.register(adminBannersRoutes);
}
