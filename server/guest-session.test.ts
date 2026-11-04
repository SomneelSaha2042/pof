import test from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { guestSessions } from "./guest-session";

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
