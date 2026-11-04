import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, togglePlayerReady, startRound, applyFlopDecision } from "../shared/game-engine";

function readyGame() {
  let state = joinGame(createGame("POF-SECURITY", "Alice", "alice"), "Bob", "bob");
  state = togglePlayerReady(state, "alice");
  return togglePlayerReady(state, "bob");
}

test("an active hand cannot be redealt or lose outstanding contributions", () => {
  const state = applyFlopDecision(startRound(readyGame()), "alice", "pot");
  const original = structuredClone(state);
  assert.throws(() => startRound(state), /unfinished hand/);
  assert.deepEqual(state, original);

  const sideGame = applyFlopDecision(applyFlopDecision(startRound(readyGame()), "alice", "fold"), "bob", "fold");
  assert.equal(sideGame.phase, "side_game");
  assert.throws(() => startRound(sideGame), /unfinished hand/);
});
