import test from "node:test";
import assert from "node:assert/strict";
import { requestLimit } from "./request-limit";

test("request limits apply across connections, reset at the boundary, and bound new keys", () => {
  const allowed = requestLimit(2, 1000);
  assert.equal(allowed("same-peer", 0), true);
  assert.equal(allowed("same-peer", 1), true);
  assert.equal(allowed("same-peer", 2), false);
  assert.equal(allowed("same-peer", 1000), true);
  for (let i = 0; i < 9999; i++) assert.equal(allowed(`peer-${i}`, 1000), true);
  assert.equal(allowed("overflow", 1000), false);
  assert.equal(allowed("overflow", 2000), true);
});
