import test from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { guestSessions, sessionSecretFor } from "./guest-session";
import { MemStorage } from "./storage/mem-storage";
import { RedisStorage } from "./storage/redis-storage";

test("guest cookies are signed, private, and stable with the same server secret", () => {
  const sessions = guestSessions("test-secret");
  let token = "";
  const res = { cookie(_name: string, value: string, options: any) { token = value; assert.equal(options.httpOnly, true); assert.equal(options.sameSite, "strict"); } } as Response;
  const id = sessions.resolve(undefined, res);
  assert.equal(sessions.read(`pof_guest=${token}`), id);
  assert.equal(guestSessions("test-secret").read(`pof_guest=${token}`), id);
  assert.equal(guestSessions("other-secret").read(`pof_guest=${token}`), undefined);
  assert.equal(sessions.read(`pof_guest=${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`), undefined);
  assert.equal(sessions.read("pof_guest=forged"), undefined);
});

test("valid configured keys take precedence and weak configured keys use a secure stored key", async t => {
  const rooms = new MemStorage();
  const configured = "configured-secret-".repeat(4);
  assert.equal(await sessionSecretFor(rooms, configured), configured);
  const warning = t.mock.method(console, "warn", () => {});
  assert.equal(await sessionSecretFor(rooms, "short"), await rooms.getSessionSecret());
  assert.equal(warning.mock.callCount(), 1);
  assert.equal(await sessionSecretFor(rooms, ""), await rooms.getSessionSecret());
});

test("Redis signing keys survive storage instances and concurrent initialization without an expiry", async () => {
  const persisted = new Map<string, string>();
  const client = {
    isReady: true,
    async set(key: string, value: string, options: any) {
      assert.deepEqual(options, { NX: true });
      if (persisted.has(key)) return null;
      persisted.set(key, value);
      return "OK";
    },
    async get(key: string) { return persisted.get(key) ?? null; },
  };
  // Independent storage objects share the same Redis data, as after an app restart.
  const instance = () => Object.assign(Object.create(RedisStorage.prototype), { redis: client }) as RedisStorage;
  const [first, simultaneous] = await Promise.all([instance().getSessionSecret(), instance().getSessionSecret()]);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, simultaneous);
  assert.equal(await instance().getSessionSecret(), first);
  assert.equal(persisted.size, 1);
  persisted.set("pof:session-secret", "invalid");
  await assert.rejects(instance().getSessionSecret(), /signing key is invalid/);
  const unavailable = Object.assign(Object.create(RedisStorage.prototype), { redis: { isReady: true, async set() { throw new Error("Redis unavailable"); } } }) as RedisStorage;
  await assert.rejects(unavailable.getSessionSecret(), /Redis unavailable/);
});
