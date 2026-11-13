import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "@cyanflix/database";
import { sessionIdentity, requireOwner } from "../../lib/auth-guards.js";
import { normalizeUsername } from "../../lib/mappers.js";
import { hashPassword } from "../../auth.js";

export async function adminAccountsRoutes(app: FastifyInstance) {
app.get("/api/admin/accounts", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  return prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      role: true,
      disabled: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { profiles: true } },
    },
  });
});
app.post("/api/admin/accounts", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const body = request.body as {
    username?: string;
    password?: string;
    role?: string;
  };
  const username = normalizeUsername(body?.username);
  if (!username)
    return reply.code(400).send({
      error:
        "Usuário deve ter entre 3 e 64 caracteres e usar apenas letras, números, ponto, hífen ou sublinhado",
    });
  if (!body?.password || body.password.length < 4)
    return reply
      .code(400)
      .send({ error: "Senha deve ter pelo menos 4 caracteres" });
  const role =
    body.role === "admin" || body.role === "viewer" ? body.role : null;
  if (!role)
    return reply.code(400).send({ error: "Função deve ser admin ou viewer" });
  const passwordHash = await hashPassword(body.password);
  try {
    const account = await prisma.account.create({
      data: { username, passwordHash, role },
    });
    return reply.code(201).send({
      id: account.id,
      username: account.username,
      role: account.role,
      disabled: account.disabled,
      createdAt: account.createdAt,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return reply.code(409).send({ error: "Usuário já existe" });
    throw error;
  }
});
app.patch("/api/admin/accounts/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  const body = request.body as {
    role?: string;
    disabled?: boolean;
    password?: string;
  };
  if (
    id === identity.accountId &&
    (body.disabled === true || (body.role && body.role !== "owner"))
  ) {
    return reply.code(409).send({
      error: "A conta owner ativa não pode desativar ou rebaixar a si própria",
    });
  }
  const role =
    body.role === undefined
      ? undefined
      : body.role === "admin" || body.role === "viewer"
        ? body.role
        : null;
  if (role === null) return reply.code(400).send({ error: "Função inválida" });
  if (body.password !== undefined && body.password.length < 4)
    return reply
      .code(400)
      .send({ error: "Senha deve ter pelo menos 4 caracteres" });
  const account = await prisma.account.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!account) return reply.code(404).send({ error: "Conta não encontrada" });
  if (account.role === "owner" && id !== identity.accountId)
    return reply
      .code(403)
      .send({ error: "Outra conta owner não pode ser alterada" });
  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...(role ? { role } : {}),
      ...(typeof body.disabled === "boolean"
        ? { disabled: body.disabled }
        : {}),
      ...(body.password
        ? { passwordHash: await hashPassword(body.password) }
        : {}),
    },
    select: {
      id: true,
      username: true,
      role: true,
      disabled: true,
      updatedAt: true,
    },
  });
  return updated;
});
app.delete("/api/admin/accounts/:id", async (request, reply) => {
  if (!requireOwner(request, reply)) return;
  const identity = sessionIdentity(request);
  const id = (request.params as { id: string }).id;
  if (id === identity.accountId) {
    return reply
      .code(409)
      .send({ error: "Você não pode excluir sua própria conta conectada" });
  }
  const account = await prisma.account.findUnique({
    where: { id },
    select: { id: true, role: true, username: true },
  });
  if (!account) return reply.code(404).send({ error: "Conta não encontrada" });
  if (account.role === "owner") {
    return reply.code(403).send({
      error: "Contas com papel de proprietário (owner) não podem ser excluídas",
    });
  }
  await prisma.$transaction(async (tx) => {
    await tx.editorialOverride.updateMany({
      where: { updatedByAccountId: id },
      data: { updatedByAccountId: identity.accountId },
    });
    await tx.editorialCollection.updateMany({
      where: { createdByAccountId: id },
      data: { createdByAccountId: identity.accountId },
    });
    await tx.editorialCollection.updateMany({
      where: { updatedByAccountId: id },
      data: { updatedByAccountId: identity.accountId },
    });
    await tx.auditLog.deleteMany({
      where: { actorAccountId: id },
    });
    await tx.account.delete({ where: { id } });
  });

  return { ok: true };
});
}
