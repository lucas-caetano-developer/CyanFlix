import type { FastifyInstance } from "fastify";
import { toJson } from "../../lib/mappers.js";
import {
  getStoredBannerConfigs,
  saveStoredBannerConfigs,
  type BannerCustomStatesMap,
} from "../../services/banner-configs.js";

export async function adminBannersRoutes(app: FastifyInstance) {
  app.get("/api/admin/banners/custom-states", async () => {
    const states = await getStoredBannerConfigs();
    return toJson(states);
  });

  app.put("/api/admin/banners/custom-states", async (request, reply) => {
    const body = request.body as { states?: BannerCustomStatesMap };
    if (!body || typeof body.states !== "object" || body.states === null) {
      return reply
        .code(400)
        .send({ error: "Formato inválido. 'states' deve ser um objeto." });
    }
    await saveStoredBannerConfigs(body.states);
    return toJson({ success: true, states: body.states });
  });

  app.get("/api/public/banners/custom-states", async () => {
    const states = await getStoredBannerConfigs();
    return toJson(states);
  });
}
