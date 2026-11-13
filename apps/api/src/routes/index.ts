import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.js";
import { profileRoutes } from "./profiles.js";
import { catalogRoutes } from "./catalog.js";
import { playbackRoutes } from "./playback.js";
import { publicationV1Routes } from "./publications-v1.js";
import { adminRoutes } from "./admin/index.js";

export async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(profileRoutes);
  await app.register(catalogRoutes);
  await app.register(playbackRoutes);
  await app.register(publicationV1Routes);
  await app.register(adminRoutes);
}
