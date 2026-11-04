import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, togglePlayerReady, startRound, applyFlopDecision, addBotPlayer, computeBestSideArrangement, evaluateSideArrangement, compareSideHands1v1 } from "../shared/game-engine";
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

test("three wild threes complete Quads and receive the 7x payout", () => {
  const quads = computeBestSideArrangement([{ r: 9, s: "S" }, { r: 3, s: "S" }, { r: 3, s: "H" }, { r: 3, s: "D" }, { r: 4, s: "C" }]);
  assert.equal(quads.tier, "quads");
  assert.equal(quads.quadRank, 9);
  assert.equal(quads.highEval.pairRank, 9);
  assert.equal(quads.lowEval.pairRank, 9);
  const opponent = computeBestSideArrangement([{ r: 10, s: "C" }, { r: 11, s: "C" }, { r: 12, s: "C" }, { r: 13, s: "C" }, { r: 2, s: "C" }]);
  const result = compareSideHands1v1({ id: "a", name: "Alice", eval: quads }, { id: "b", name: "Bob", eval: opponent }, 10);
  assert.equal(result.winnerId, "a");
  assert.equal(result.chipAmount, 70);
  const allWild = evaluateSideArrangement({ highBoard: [{ r: 3, s: "S" }, { r: 3, s: "H" }], lowBoard: [{ r: 3, s: "D" }, { r: 3, s: "C" }], unusedCard: { r: 2, s: "S" } });
  assert.equal(allWild.quadRank, 14);
});

test("a public bot ID never grants a private player view", () => {
  const state = startRound(togglePlayerReady(addBotPlayer(createGame("POF-BOT", "Alice", "alice")), "alice"));
  const bot = state.players.find(p => p.isBot)!;
  const view = redactGameStateForPlayer(state, bot.id);
  assert.ok(view.players.find(p => p.isBot)!.hand.every(c => c === null));
  assert.ok(view.deck.every(c => c === null));
  assert.ok(redactGameStateForPlayer(state, "alice").players[0].hand.every(c => c !== null));
});
