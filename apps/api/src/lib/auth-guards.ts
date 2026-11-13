import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@cyanflix/database";
import { auth, requestSessions, type SessionIdentity } from "./config.js";

export function sessionIdentity(request: FastifyRequest): SessionIdentity {
  const identity = requestSessions.get(request);
  if (!identity) throw new Error("Identidade da sessão indisponível");
  return identity;
}

export function requireOwner(request: FastifyRequest, reply: FastifyReply): boolean {
  if (sessionIdentity(request).role === "owner") return true;
  void reply.code(403).send({ error: "Owner access required" });
  return false;
}

export async function requireOwnedProfile(
  request: FastifyRequest,
  profileId: string,
  reply: FastifyReply,
): Promise<void> {
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, accountId: sessionIdentity(request).accountId },
    select: { id: true },
  });
  if (!profile) await reply.code(404).send({ error: "Perfil não encontrado" });
}

export async function requireActiveProfile(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const selected = auth.profile(request);
  if (!selected) {
    await reply.code(401).send({ error: "Selecione e desbloqueie um perfil" });
    return null;
  }
  const profile = await prisma.profile.findFirst({
    where: { id: selected.profileId, accountId: selected.accountId },
    select: { id: true, accountId: true, maxAgeRating: true },
  });
  if (!profile) {
    await reply.code(401).send({ error: "Perfil indisponível" });
    return null;
  }
  return profile;
}

export async function requireActiveOwnedProfile(
  request: FastifyRequest,
  profileId: string,
  reply: FastifyReply,
) {
  const profile = await requireActiveProfile(request, reply);
  if (!profile) return null;
  if (
    profile.id !== profileId ||
    profile.accountId !== sessionIdentity(request).accountId
  ) {
    await reply.code(404).send({ error: "Perfil não encontrado" });
    return null;
  }
  return profile;
}
