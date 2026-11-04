import test from "node:test";
import assert from "node:assert/strict";
import { createGame, joinGame, togglePlayerReady, startRound, applyFlopDecision, addBotPlayer, computeBestSideArrangement, evaluateSideArrangement, compareSideHands1v1 } from "../shared/game-engine";
import { redactGameStateForPlayer } from "./routes";
import { expireGameActions, leaveGame } from "../shared/game-engine";
import { expireRoomActions } from "./game-deadlines";
import { MemStorage } from "./storage/mem-storage";
import { setRoomAnte, isTableHost } from "../shared/game-engine";

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

test("ante changes revoke consent and every hand needs fresh readiness", () => {
  const changed = setRoomAnte(readyGame(), 10000);
  assert.ok(changed.players.every(p => !p.ready));
  assert.throws(() => startRound(changed), /ready/);
  let state = startRound(readyGame());
  state = applyFlopDecision(state, "alice", "pot");
  state = applyFlopDecision(state, "bob", "pot");
  assert.equal(state.phase, "settlement");
  assert.throws(() => startRound(state), /ready/);
  state = togglePlayerReady(togglePlayerReady(state, "alice"), "bob");
  assert.equal(startRound(state).roundNumber, 2);
  assert.equal(isTableHost(state, "alice"), true);
  assert.equal(isTableHost(state, "bob"), false);
  assert.equal(isTableHost(leaveGame(state, "alice"), "bob"), true);
});

test("server deadlines fold idle players, lock side hands, and survive serialization", () => {
  let state = startRound(readyGame());
  state = JSON.parse(JSON.stringify(state));
  state = expireGameActions(state, state.actionDeadline!);
  assert.equal(state.players[0].decision, "fold");
  assert.equal(state.turnIdx, 1);
  state = expireGameActions(state, state.actionDeadline!);
  assert.equal(state.phase, "side_game");
  state = expireGameActions(state, state.actionDeadline!);
  assert.equal(state.phase, "settlement");
  assert.ok(state.players.every(p => p.sideLocked));
  assert.equal(state.carryoverPot, 20);
});

test("the deadline worker persists automatic actions without any player connections", async () => {
  const rooms = new MemStorage();
  const state = startRound(readyGame());
  await rooms.createRoom(state);
  const published: string[] = [];
  await expireRoomActions(rooms, state => published.push(state.players[0].decision), state.actionDeadline! - 1);
  assert.deepEqual(published, []);
  await expireRoomActions(rooms, state => published.push(state.players[0].decision), state.actionDeadline!);
  assert.deepEqual(published, ["fold"]);
  assert.equal((await rooms.getRoom(state.roomCode))!.turnIdx, 1);
});

test("late player decisions cannot beat the deadline worker", () => {
  const state = { ...startRound(readyGame()), actionDeadline: Date.now() - 1 };
  assert.throws(() => applyFlopDecision(state, "alice", "pot"), /deadline/);
});

test("leaving settles the current obligation but excludes a seat from future antes", () => {
  let state = joinGame(readyGame(), "Charlie", "charlie");
  state = togglePlayerReady(state, "charlie");
  state = leaveGame(startRound(state), "alice");
  assert.equal(state.players[0].decision, "fold");
  assert.equal(state.players[0].potContribution, 10);
  state = applyFlopDecision(state, "bob", "pot");
  state = applyFlopDecision(state, "charlie", "pot");
  assert.equal(state.phase, "settlement");
  const total = state.players.reduce((sum, p) => sum + p.chipDelta, 0);
  assert.equal(total, 0);
  state = togglePlayerReady(togglePlayerReady(state, "bob"), "charlie");
  state = startRound(state);
  assert.equal(state.players[0].potContribution, 0);
  assert.equal(state.players[0].hand.length, 0);
  assert.equal(state.mainPot, 20);
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
