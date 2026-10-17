import assert from "node:assert/strict";
import test from "node:test";

import { createAuth, hashPassword, verifyPassword } from "../apps/api/dist/auth.js";

const env = {
  appUrl: "https://cyanflix.example",
  sessionSecret: "a-session-secret-long-enough-for-tests",
  sessionTtlHours: 1,
  publisherAccessTtlMinutes: 15,
};

test("stores passwords as salted scrypt hashes", async () => {
  const first = await hashPassword("a strong private password");
  const second = await hashPassword("a strong private password");
  assert.match(first, /^scrypt\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("a strong private password", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
});

test("binds account identity and role to a signed session", () => {
  const auth = createAuth(env);
  const headers = new Map();
  auth.setSession({ header: (name, value) => headers.set(name, value) }, { accountId: "account-1", role: "owner" });
  const cookie = headers.get("Set-Cookie").split(";", 1)[0];
  const request = { headers: { cookie } };
  assert.deepEqual(auth.session(request), { accountId: "account-1", role: "owner" });
  assert.equal(auth.hasAdminSession(request), true);
});

test("does not grant administrative access to viewer sessions", () => {
  const auth = createAuth(env);
  const headers = new Map();
  auth.setSession({ header: (name, value) => headers.set(name, value) }, { accountId: "account-2", role: "viewer" });
  const request = { headers: { cookie: headers.get("Set-Cookie").split(";", 1)[0] } };
  assert.equal(auth.hasSession(request), true);
  assert.equal(auth.hasAdminSession(request), false);
});

test("binds an unlocked profile to the authenticated account", () => {
  const auth = createAuth(env);
  const sessionHeaders = new Map();
  const profileHeaders = new Map();
  auth.setSession({ header: (name, value) => sessionHeaders.set(name, value) }, { accountId: "account-1", role: "viewer" });
  auth.setProfileSession({ header: (name, value) => profileHeaders.set(name, value) }, { accountId: "account-1", role: "viewer" }, "profile-1");
  const sessionCookie = sessionHeaders.get("Set-Cookie").split(";", 1)[0];
  const profileCookie = profileHeaders.get("Set-Cookie").split(";", 1)[0];
  assert.deepEqual(auth.profile({ headers: { cookie: `${sessionCookie}; ${profileCookie}` } }), { accountId: "account-1", profileId: "profile-1" });

  const otherAccountHeaders = new Map();
  auth.setSession({ header: (name, value) => otherAccountHeaders.set(name, value) }, { accountId: "account-2", role: "viewer" });
  const otherSession = otherAccountHeaders.get("Set-Cookie").split(";", 1)[0];
  assert.equal(auth.profile({ headers: { cookie: `${otherSession}; ${profileCookie}` } }), null);
});
