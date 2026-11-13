import type { FastifyInstance } from "fastify";
import { prisma } from "@cyanflix/database";
import { auth, env, loginAttempts, requestSessions } from "../lib/config.js";
import { verifyPassword } from "../auth.js";
import { normalizeUsername } from "../lib/mappers.js";

export async function authRoutes(app: FastifyInstance) {
app.post("/api/auth/login", async (request, reply) => {
  const body = request.body as { username?: string; password?: string };
  const now = Date.now();
  const attempt = loginAttempts.get(request.ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 15)
    return reply
      .code(429)
      .send({ error: "Muitas tentativas; aguarde alguns minutos" });
  const username = normalizeUsername(body?.username ?? "cyan@admin.com");
  const account = username
    ? await prisma.account.findUnique({ where: { username } })
    : null;
  if (
    !body?.password ||
    !account ||
    account.disabled ||
    !(await verifyPassword(body.password, account.passwordHash))
  ) {
    loginAttempts.set(request.ip, {
      count: attempt && attempt.resetAt > now ? attempt.count + 1 : 1,
      resetAt: now + 5 * 60_000,
    });
    return reply.code(401).send({ error: "Credenciais inválidas" });
  }
  loginAttempts.delete(request.ip);
  auth.setSession(reply, { accountId: account.id, role: account.role });
  return {
    authenticated: true,
    accountId: account.id,
    username: account.username,
    role: account.role,
  };
});
app.post("/api/auth/logout", async (_request, reply) => {
  auth.clearSession(reply);
  return reply.code(204).send();
});
app.get("/api/auth/session", async (request, reply) => {
  const identity = requestSessions.get(request);
  if (!identity) {
    return { authenticated: false };
  }
  const account = await prisma.account.findFirst({
    where: { id: identity.accountId, disabled: false },
    select: { id: true, username: true, role: true },
  });
  if (!account) {
    auth.clearSession(reply);
    return { authenticated: false };
  }
  return {
    authenticated: true,
    accountId: account.id,
    username: account.username,
    role: account.role,
  };
});
app.get("/api/auth/verify", async (request, reply) => {
  const originalUri = String(request.headers["x-original-uri"] ?? "");
  // Imagens estáticas (pôsteres, backdrops, logos, avatares) são sempre públicas
  const isImage = /\.(webp|jpg|jpeg|png|svg|avif|gif)($|\?)/i.test(originalUri);
  if (isImage) {
    return reply.code(204).send();
  }

  // Mídias de reprodução (streams HLS m3u8, mp4, m4s) exigem sessão ativa
  const tokenIdentity = auth.session(request);
  if (!tokenIdentity) {
    return reply.code(401).send();
  }

  const cacheKey = originalUri.match(
    /^\/transcode\/([a-f0-9]{64})(?:\/|$)/,
  )?.[1];
  if (cacheKey) {
    const now = new Date();
    void prisma.transcodeJob
      .updateMany({
        where: { cacheKey, state: "finished" },
        data: {
          lastAccessAt: now,
          protectedUntil: new Date(now.getTime() + 10 * 60_000),
        },
      })
      .catch((error) =>
        request.log.error(
          { err: error, cacheKey },
          "failed to protect active transcode cache",
        ),
      );
  }
  return reply.code(204).send();
});

app.post("/v1/auth/token", async (request, reply) => {
  const header = request.headers.authorization;
  const candidate = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!auth.matchesSecret(candidate, env.publisherToken))
    return reply.code(401).send({ error: "Unauthorized" });
  return auth.publisherAccessToken();
});

const profilePublicSelect = {
  id: true,
  name: true,
  avatar: true,
  role: true,
  preferences: true,
  maxAgeRating: true,
  createdAt: true,
  updatedAt: true,
  pinHash: true,
} as const;
}
