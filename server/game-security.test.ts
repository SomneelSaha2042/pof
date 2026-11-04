import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, togglePlayerReady, startRound, applyFlopDecision, addBotPlayer } from "../shared/game-engine";
import { redactGameStateForPlayer } from "./routes";

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

test("a public bot ID never grants a private player view", () => {
  const state = startRound(togglePlayerReady(addBotPlayer(createGame("POF-BOT", "Alice", "alice")), "alice"));
  const bot = state.players.find(p => p.isBot)!;
  const view = redactGameStateForPlayer(state, bot.id);
  assert.ok(view.players.find(p => p.isBot)!.hand.every(c => c === null));
  assert.ok(view.deck.every(c => c === null));
  assert.ok(redactGameStateForPlayer(state, "alice").players[0].hand.every(c => c !== null));
});
