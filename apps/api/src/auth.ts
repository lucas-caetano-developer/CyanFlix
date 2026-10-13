import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "@cyanflix/shared";

type TokenPayload = { scope: "session" | "publish"; exp: number };

export function createAuth(env: AppEnv) {
  const cookieName = "cyanflix_session";

  function sign(scope: TokenPayload["scope"], ttlSeconds: number): string {
    const encoded = Buffer.from(JSON.stringify({ scope, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
    const signature = crypto.createHmac("sha256", env.sessionSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  function verify(token: string | undefined, scope: TokenPayload["scope"]): boolean {
    if (!token) return false;
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return false;
    const expected = crypto.createHmac("sha256", env.sessionSecret).update(encoded).digest();
    let received: Buffer;
    try { received = Buffer.from(signature, "base64url"); } catch { return false; }
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
      return payload.scope === scope && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  function cookieToken(request: FastifyRequest): string | undefined {
    const cookies = String(request.headers.cookie ?? "").split(";");
    for (const item of cookies) {
      const [name, ...parts] = item.trim().split("=");
      if (name === cookieName) return decodeURIComponent(parts.join("="));
    }
    return undefined;
  }

  function bearerToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  }

  function hasSession(request: FastifyRequest): boolean {
    return verify(cookieToken(request), "session");
  }

  function canPublish(request: FastifyRequest): boolean {
    return hasSession(request) || verify(bearerToken(request), "publish");
  }

  function matchesSecret(candidate: string | undefined, expected: string): boolean {
    if (!candidate) return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  function setSession(reply: FastifyReply): void {
    const token = sign("session", env.sessionTtlHours * 3600);
    const secure = env.appUrl.startsWith("https://");
    reply.header("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${env.sessionTtlHours * 3600}${secure ? "; Secure" : ""}`);
  }

  function clearSession(reply: FastifyReply): void {
    const secure = env.appUrl.startsWith("https://");
    reply.header("Set-Cookie", `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
  }

  function publisherAccessToken(): { access_token: string; token_type: "Bearer"; expires_in: number } {
    const expiresIn = env.publisherAccessTtlMinutes * 60;
    return { access_token: sign("publish", expiresIn), token_type: "Bearer", expires_in: expiresIn };
  }

  return { hasSession, canPublish, matchesSecret, setSession, clearSession, publisherAccessToken };
}
