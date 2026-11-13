import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import { prisma } from "@cyanflix/database";
import { env, auth, allowedOrigin, requestSessions } from "./lib/config.js";
import { safeDataPath, cleanupUploadTemporaries } from "./lib/storage.js";
import { registerRoutes } from "./routes/index.js";

const app = Fastify({
  logger: true,
  trustProxy: process.env.TRUST_PROXY === "true",
  bodyLimit: Number(process.env.API_BODY_LIMIT_BYTES ?? 2 * 1024 * 1024),
});

await app.register(cors, { origin: allowedOrigin, credentials: true });
app.addContentTypeParser(
  "application/octet-stream",
  (_request, payload, done) => done(null, payload),
);

const libraryStaticPath = safeDataPath("library");
if (!fs.existsSync(libraryStaticPath)) {
  fs.mkdirSync(libraryStaticPath, { recursive: true });
}
await app.register(fastifyStatic, {
  root: libraryStaticPath,
  prefix: "/media/",
  decorateReply: false,
});

app.addHook("onRequest", async (request, reply) => {
  const pathname = request.url.split("?", 1)[0];
  if (
    pathname === "/health" ||
    pathname === "/api/health" ||
    pathname === "/api/auth/login" ||
    pathname === "/v1/auth/token" ||
    pathname === "/api/auth/verify"
  )
    return;
  if (pathname.startsWith("/media/")) {
    const isImage = /\.(webp|jpg|jpeg|png|svg|avif|gif)($|\?)/i.test(pathname);
    if (!isImage) {
      const tokenIdentity = auth.session(request);
      if (!tokenIdentity)
        return reply.code(401).send({ error: "Unauthorized" });
    }
    return;
  }
  if (pathname.startsWith("/v1/")) {
    const identity = auth.session(request);
    if (identity) {
      const account = await prisma.account.findFirst({
        where: {
          id: identity.accountId,
          disabled: false,
          role: { in: ["owner", "admin"] },
        },
        select: { id: true },
      });
      if (!account)
        return reply.code(403).send({ error: "Publisher access required" });
    } else if (!auth.canPublish(request))
      return reply.code(401).send({ error: "Unauthorized" });
    return;
  }
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/auth/session") {
      const tokenIdentity = auth.session(request);
      if (tokenIdentity) {
        const account = await prisma.account.findFirst({
          where: { id: tokenIdentity.accountId, disabled: false },
          select: { id: true, role: true },
        });
        if (account) {
          requestSessions.set(request, {
            accountId: account.id,
            role: account.role,
          });
        }
      }
      return;
    }
    if (pathname.startsWith("/api/public/")) {
      return;
    }
    const tokenIdentity = auth.session(request);
    if (!tokenIdentity) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    const account = await prisma.account.findFirst({
      where: { id: tokenIdentity.accountId, disabled: false },
      select: { id: true, role: true },
    });
    if (!account) {
      auth.clearSession(reply);
      return reply.code(401).send({ error: "Authentication required" });
    }
    const identity = { accountId: account.id, role: account.role };
    requestSessions.set(request, identity);
    if (
      pathname.startsWith("/api/admin/") &&
      identity.role !== "owner" &&
      identity.role !== "admin"
    ) {
      return reply.code(403).send({ error: "Administrator access required" });
    }
  }
  if (
    pathname.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    const origin = request.headers.origin;
    if (origin && origin !== allowedOrigin)
      return reply.code(403).send({ error: "Invalid origin" });
  }
});

app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error }, "request failed");
  const status =
    typeof error.statusCode === "number" && error.statusCode >= 400
      ? error.statusCode
      : 500;
  reply
    .code(status)
    .send({ error: status === 500 ? "Internal server error" : error.message });
});

app.get("/health", async () => ({ ok: true, service: "cyanflix-api" }));
app.get("/api/health", async () => ({ ok: true, service: "cyanflix-api" }));

await registerRoutes(app);

await cleanupUploadTemporaries();
await app.listen({ host: "0.0.0.0", port: env.port });
