import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function ensureDefaultProfile() {
  const profile = prisma.profile as any;
  const admin = await profile.findFirst({ where: { role: "admin" } });
  if (!admin) await profile.create({ data: { name: "Admin", avatar: "admin", role: "admin" } });

  const viewer = await profile.findFirst({ where: { role: "viewer" } });
  if (!viewer) await profile.create({ data: { name: "Assistir", avatar: "play", role: "viewer" } });
}
