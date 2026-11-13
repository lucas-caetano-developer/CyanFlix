import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { toJson } from "../../lib/mappers.js";
import {
  getStoredHomeSections,
  saveStoredHomeSections,
  type HomeSectionConfig,
} from "../../services/home-sections.js";

export async function adminHomeSectionsRoutes(app: FastifyInstance) {
app.get("/api/admin/home-sections", async () => {
  const sections = await getStoredHomeSections();
  const collections = await prisma.editorialCollection.findMany({
    where: { state: "published", active: true },
    select: { id: true, slug: true, title: true },
  });
  const existingIds = new Set(sections.map((s) => s.id));
  const result = [...sections];
  for (const col of collections) {
    if (col.slug === "__cyanflix_home_sections__") continue;
    const colId = `collection:${col.slug}`;
    if (!existingIds.has(colId)) {
      result.push({
        id: colId,
        title: col.title,
        defaultTitle: col.title,
        enabled: true,
        type: "collection",
        sortOrder: result.length,
      });
    }
  }
  return toJson(result);
});
app.put("/api/admin/home-sections", async (request, reply) => {
  const body = request.body as { sections?: HomeSectionConfig[] };
  if (!Array.isArray(body?.sections)) {
    return reply
      .code(400)
      .send({ error: "Formato inválido. 'sections' deve ser um array." });
  }
  const sanitized = body.sections.map((sec, index) => ({
    id: String(sec.id),
    title: String(sec.title || sec.defaultTitle || sec.id).trim(),
    defaultTitle: String(sec.defaultTitle || sec.title || sec.id).trim(),
    enabled: Boolean(sec.enabled),
    type: (sec.type === "genre" || sec.type === "collection"
      ? sec.type
      : "system") as "system" | "genre" | "collection",
    sortOrder: typeof sec.sortOrder === "number" ? sec.sortOrder : index,
  }));
  await saveStoredHomeSections(sanitized);

  return toJson({ success: true, sections: sanitized });
});
}
