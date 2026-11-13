import type { FastifyRequest } from "fastify";
import { readEnv } from "@cyanflix/shared";
import { createAuth } from "../auth.js";

export const env = readEnv();
export const auth = createAuth(env);
export const allowedOrigin = new URL(env.appUrl).origin;

export const loginAttempts = new Map<string, { count: number; resetAt: number }>();
export const profileUnlockAttempts = new Map<
  string,
  { count: number; resetAt: number }
>();

export type SessionIdentity = {
  accountId: string;
  role: "owner" | "admin" | "viewer";
};

export const requestSessions = new WeakMap<FastifyRequest, SessionIdentity>();

export const activeUploads = new Set<string>();
export const activeWorkDeletions = new Set<string>();

// HLS packages contain hundreds of sibling segments. Cache directory creation
// per API process so every segment does not contend on the Docker volume's
// directory metadata before its actual stream can be written.
export const uploadDirectories = new Map<string, Promise<void>>();
