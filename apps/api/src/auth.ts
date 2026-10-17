import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "@cyanflix/shared";

export type SessionRole = "owner" | "admin" | "viewer";
export type SessionIdentity = { accountId: string; role: SessionRole };
type TokenPayload = { scope: "session" | "publish" | "profile"; exp: number; accountId?: string; role?: SessionRole; profileId?: string };

export function createAuth(env: AppEnv) {
  const cookieName = "cyanflix_session";

  function sign(scope: TokenPayload["scope"], ttlSeconds: number, identity?: SessionIdentity & { profileId?: string }): string {
    const encoded = Buffer.from(JSON.stringify({ scope, exp: Math.floor(Date.now() / 1000) + ttlSeconds, ...identity })).toString("base64url");
    const signature = crypto.createHmac("sha256", env.sessionSecret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
  }

  function payload(token: string | undefined, scope: TokenPayload["scope"]): TokenPayload | null {
    if (!token) return null;
    const [encoded, signature, extra] = token.split(".");
    if (!encoded || !signature || extra) return null;
    const expected = crypto.createHmac("sha256", env.sessionSecret).update(encoded).digest();
    let received: Buffer;
    try { received = Buffer.from(signature, "base64url"); } catch { return null; }
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
    try {
      const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
      return payload.scope === scope && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
    } catch {
      return null;
    }
  }

  function cookieToken(request: FastifyRequest, requestedName = cookieName): string | undefined {
    const cookies = String(request.headers.cookie ?? "").split(";");
    for (const item of cookies) {
      const [name, ...parts] = item.trim().split("=");
      if (name === requestedName) return decodeURIComponent(parts.join("="));
    }
    return undefined;
  }

  function bearerToken(request: FastifyRequest): string | undefined {
    const header = request.headers.authorization;
    return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  }

  function hasSession(request: FastifyRequest): boolean {
    return session(request) !== null;
  }

  function hasAdminSession(request: FastifyRequest): boolean {
    const identity = session(request);
    return identity?.role === "owner" || identity?.role === "admin";
  }

  function session(request: FastifyRequest): SessionIdentity | null {
    const token = cookieToken(request);
    const decoded = payload(token, "session");
    if (!decoded?.accountId || !decoded.role || !["owner", "admin", "viewer"].includes(decoded.role)) return null;
    return { accountId: decoded.accountId, role: decoded.role };
  }

  function profile(request: FastifyRequest): { accountId: string; profileId: string } | null {
    const sessionIdentity = session(request);
    const decoded = payload(cookieToken(request, "cyanflix_profile"), "profile");
    if (!sessionIdentity || !decoded?.accountId || !decoded.profileId || decoded.accountId !== sessionIdentity.accountId) return null;
    return { accountId: decoded.accountId, profileId: decoded.profileId };
  }

  function canPublish(request: FastifyRequest): boolean {
    return hasSession(request) || payload(bearerToken(request), "publish") !== null;
  }

  function matchesSecret(candidate: string | undefined, expected: string): boolean {
    if (!candidate) return false;
    const left = Buffer.from(candidate);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  function setSession(reply: FastifyReply, identity: SessionIdentity): void {
    const token = sign("session", env.sessionTtlHours * 3600, identity);
    const secure = env.appUrl.startsWith("https://");
    reply.header("Set-Cookie", `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${env.sessionTtlHours * 3600}${secure ? "; Secure" : ""}`);
  }

  function clearSession(reply: FastifyReply): void {
    const secure = env.appUrl.startsWith("https://");
    reply.header("Set-Cookie", [
      `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
      `cyanflix_profile=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
    ]);
  }

  function setProfileSession(reply: FastifyReply, identity: SessionIdentity, profileId: string): void {
    const token = sign("profile", env.sessionTtlHours * 3600, { ...identity, profileId });
    const secure = env.appUrl.startsWith("https://");
    reply.header("Set-Cookie", `cyanflix_profile=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${env.sessionTtlHours * 3600}${secure ? "; Secure" : ""}`);
  }

  function publisherAccessToken(): { access_token: string; token_type: "Bearer"; expires_in: number } {
    const expiresIn = env.publisherAccessTtlMinutes * 60;
    return { access_token: sign("publish", expiresIn), token_type: "Bearer", expires_in: expiresIn };
  }

  return { hasSession, hasAdminSession, session, profile, canPublish, matchesSecret, setSession, setProfileSession, clearSession, publisherAccessToken };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, hashText, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltText || !hashText || extra) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}
