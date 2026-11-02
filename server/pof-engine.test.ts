import test from "node:test";
import assert from "node:assert/strict";
import type { Card } from "@shared/game-types";
import {
  computeBestSideArrangement,
  compareSideHands1v1,
  evaluateBestOmahaHand,
  evaluateTwoCardBoard,
  createGame,
  joinGame,
  togglePlayerReady,
  startRound,
  applyFlopDecision,
  submitSideHand,
} from "@shared/game-engine";
import { redactGameStateForPlayer } from "./routes";

const c = (r: Card["r"], s: Card["s"] = "S"): Card => ({ r, s });

test("Side game 2-card hierarchy: Pair > 82 > Baccarat 9..0", () => {
  const pairDeuces = evaluateTwoCardBoard([c(2, "S"), c(2, "H")]);
  const eightTwo = evaluateTwoCardBoard([c(8, "S"), c(2, "D")]);
  const baccaratNine = evaluateTwoCardBoard([c(13, "S"), c(9, "H")]);
  const baccaratZero = evaluateTwoCardBoard([c(13, "S"), c(12, "H")]);

  assert.equal(pairDeuces.kind, "pair");
  assert.equal(eightTwo.kind, "eight_two");
  assert.equal(baccaratNine.kind, "baccarat");
  assert.equal(baccaratNine.baccaratValue, 9);

  assert.ok(pairDeuces.score > eightTwo.score, "22 must beat 82");
  assert.ok(eightTwo.score > baccaratNine.score, "82 must beat Baccarat 9");
  assert.ok(baccaratNine.score > baccaratZero.score, "Baccarat 9 must beat Baccarat 0");
});

test("Prompt example: AAK9Q best side game hand is AA and K9", () => {
  const hand = [c(1, "S"), c(1, "H"), c(13, "D"), c(9, "C"), c(12, "S")];
  const best = computeBestSideArrangement(hand);

  assert.equal(best.tier, "normal");
  assert.equal(best.multiplier, 2);
  assert.equal(best.highEval.kind, "pair");
  assert.equal(best.highEval.pairRank, 14); // AA
  assert.equal(best.lowEval.kind, "baccarat");
  assert.equal(best.lowEval.baccaratValue, 9); // K9 or Q9 = 9
});

test("Prompt example: 22KK4 is a Popo (4x)", () => {
  const hand = [c(2, "S"), c(2, "H"), c(13, "D"), c(13, "C"), c(4, "S")];
  const best = computeBestSideArrangement(hand);

  assert.equal(best.tier, "popo");
  assert.equal(best.multiplier, 4);
  assert.equal(best.highEval.pairRank, 13); // KK
  assert.equal(best.lowEval.pairRank, 2); // 22
});

test("Prompt example: 3 acts as wild joker — A3224 arranges as Aces and Deuces Popo (4x)", () => {
  const hand = [c(1, "S"), c(3, "H"), c(2, "D"), c(2, "C"), c(4, "S")];
  const best = computeBestSideArrangement(hand);

  assert.equal(best.tier, "popo");
  assert.equal(best.multiplier, 4);
  assert.equal(best.highEval.pairRank, 14); // A + 3 -> AA
  assert.equal(best.lowEval.pairRank, 2); // 22
});

test("Prompt example: 10 J Q K is King Kong (5x) and Quads is 7x", () => {
  const kingKongHand = [c(10, "S"), c(11, "H"), c(12, "D"), c(13, "C"), c(4, "S")];
  const kkEval = computeBestSideArrangement(kingKongHand);
  assert.equal(kkEval.tier, "king_kong");
  assert.equal(kkEval.multiplier, 5);

  const wildKingKong = [c(10, "S"), c(11, "H"), c(12, "D"), c(3, "C"), c(4, "S")];
  const wildKkEval = computeBestSideArrangement(wildKingKong);
  assert.equal(wildKkEval.tier, "king_kong");
  assert.equal(wildKkEval.multiplier, 5);

  const quadsHand = [c(9, "S"), c(9, "H"), c(9, "D"), c(3, "C"), c(4, "S")];
  const quadsEval = computeBestSideArrangement(quadsHand);
  assert.equal(quadsEval.tier, "quads");
  assert.equal(quadsEval.multiplier, 7);
  assert.equal(quadsEval.quadRank, 9);
});

test("Prompt examples: AA22K vs JJ882 pushes, and AAK92 vs JJ82A pushes", () => {
  const ante = 10;

  // 1. AA22K vs JJ882 -> Both Popo, AA > JJ but 22 < 88 -> Push
  const evalAA22 = computeBestSideArrangement([
    c(1, "S"),
    c(1, "H"),
    c(2, "D"),
    c(2, "C"),
    c(13, "S"),
  ]);
  const evalJJ88 = computeBestSideArrangement([
    c(11, "S"),
    c(11, "H"),
    c(8, "D"),
    c(8, "C"),
    c(2, "H"),
  ]);

  const res1 = compareSideHands1v1(
    { id: "p1", name: "Alice", eval: evalAA22 },
    { id: "p2", name: "Bob", eval: evalJJ88 },
    ante,
  );
  assert.equal(res1.winnerId, null);
  assert.equal(res1.chipAmount, 0);

  // 2. AAK92 vs JJ82A -> Both Normal, AA > JJ but K9 (Baccarat 9) < 82 -> Push
  const evalAAK9 = computeBestSideArrangement([
    c(1, "S"),
    c(1, "H"),
    c(13, "D"),
    c(9, "C"),
    c(2, "S"),
  ]);
  const evalJJ82 = computeBestSideArrangement([
    c(11, "S"),
    c(11, "H"),
    c(8, "D"),
    c(2, "C"),
    c(1, "D"),
  ]);

  const res2 = compareSideHands1v1(
    { id: "p1", name: "Alice", eval: evalAAK9 },
    { id: "p2", name: "Bob", eval: evalJJ82 },
    ante,
  );
  assert.equal(res2.winnerId, null);
  assert.equal(res2.chipAmount, 0);
});

test("Omaha PLO5 rule: must use exactly 2 cards from hand and 3 from community board", () => {
  // Board has 4 Hearts (A♥ K♥ Q♥ J♥) + 2♣, player has only ONE Heart (10♥) and four Spades
  // In Hold'em that would be a Royal Flush, but in PLO5 you MUST use 2 hole cards + 3 board cards, so no Flush!
  const hole = [c(10, "H"), c(9, "S"), c(8, "S"), c(4, "S"), c(2, "S")];
  const board = [c(1, "H"), c(13, "H"), c(12, "H"), c(11, "H"), c(2, "C")];

  const ev = evaluateBestOmahaHand(hole, board);
  // 10♥ + 9♠ with Q♥ J♥ K♥ makes a King-high Straight (9-10-J-Q-K), NOT a flush!
  assert.equal(ev.categoryName, "Straight");
  assert.equal(ev.holeCardsUsed.length, 2);
  assert.equal(ev.boardCardsUsed.length, 3);
});

test("Full POF hand flow: ante, flop pot/fold decisions, side game, settlement, and button rotation", () => {
  let state = createGame("POF-TEST01", "Alice", "p1", undefined, 10);
  state = joinGame(state, "Bob", "p2");
  state = joinGame(state, "Charlie", "p3");

  state = togglePlayerReady(state, "p1");
  state = togglePlayerReady(state, "p2");
  state = togglePlayerReady(state, "p3");

  state = startRound(state);
  assert.equal(state.phase, "pot_or_fold");
  assert.equal(state.buttonIdx, 0);
  assert.equal(state.turnIdx, 0);
  assert.equal(state.initialPot, 30);
  assert.equal(state.mainPot, 30);
  assert.equal(state.communityCards.length, 3);

  // Alice (on button) POTS (+30), Bob FOLDS, Charlie FOLDS
  state = applyFlopDecision(state, "p1", "pot");
  assert.equal(state.mainPot, 60);
  state = applyFlopDecision(state, "p2", "fold");
  state = applyFlopDecision(state, "p3", "fold");

  // Since 2 players folded (Bob & Charlie), game enters side_game phase
  assert.equal(state.phase, "side_game");

  state = submitSideHand(state, "p2");
  state = submitSideHand(state, "p3");

  // Now in settlement! Alice won mainPot (60) uncontested (net +20 since she put in 10 ante + 30 pot)
  assert.equal(state.phase, "settlement");
  assert.equal(state.settlement?.mainPotResult.outcome, "uncontested");
  assert.deepEqual(state.settlement?.mainPotResult.winnerIds, ["p1"]);
  assert.equal(state.settlement?.mainPotDeltas["p1"], 20);
  assert.equal(state.settlement?.sideMatchups.length, 1);

  // Next hand: button moves to seat 1 (Bob)
  state = startRound(state);
  assert.equal(state.phase, "pot_or_fold");
  assert.equal(state.roundNumber, 2);
  assert.equal(state.buttonIdx, 1);
  assert.equal(state.turnIdx, 1);
});

test("Security & state redaction: opponent cards, deck, mucked hands, and secret player IDs never leak", () => {
  let state = createGame("POF-SEC01", "Alice", "secret_alice_id", undefined, 10);
  state = joinGame(state, "Bob", "secret_bob_id");
  state = joinGame(state, "Charlie", "secret_charlie_id");

  state = togglePlayerReady(state, "secret_alice_id");
  state = togglePlayerReady(state, "secret_bob_id");
  state = togglePlayerReady(state, "secret_charlie_id");
  state = startRound(state);

  // 1. During pot_or_fold, Alice sees only her own cards and her own secret ID
  const aliceViewFlop = redactGameStateForPlayer(state, "secret_alice_id");
  assert.equal(aliceViewFlop.players[0].id, "secret_alice_id");
  assert.equal(aliceViewFlop.players[1].id, "seat_1"); // Bob's secret ID is hidden!
  assert.equal(aliceViewFlop.players[2].id, "seat_2"); // Charlie's secret ID is hidden!
  assert.ok(aliceViewFlop.players[0].hand.every((card) => card !== null));
  assert.ok(aliceViewFlop.players[1].hand.every((card) => card === null));
  assert.ok(aliceViewFlop.players[2].hand.every((card) => card === null));
  assert.ok(aliceViewFlop.deck.every((card) => card === null));

  // 2. Alice pots (1 player pots), Bob and Charlie fold (2 players fold -> side_game)
  state = applyFlopDecision(state, "secret_alice_id", "pot");
  state = applyFlopDecision(state, "secret_bob_id", "fold");
  state = applyFlopDecision(state, "secret_charlie_id", "fold");
  assert.equal(state.phase, "side_game");

  // During side_game, Bob cannot see Charlie's hole cards or side arrangement
  const bobViewSide = redactGameStateForPlayer(state, "secret_bob_id");
  assert.ok(bobViewSide.players[1].hand.every((card) => card !== null));
  assert.ok(bobViewSide.players[2].hand.every((card) => card === null));
  assert.equal(bobViewSide.players[2].sideArrangement, null);
  assert.equal(bobViewSide.players[2].sideEvaluation, null);
  // And since Alice won the main pot uncontested (only 1 potter), her cards stay mucked to Bob!
  assert.ok(bobViewSide.players[0].hand.every((card) => card === null));

  // 3. After Bob and Charlie submit their side hands -> settlement
  state = submitSideHand(state, "secret_bob_id");
  state = submitSideHand(state, "secret_charlie_id");
  assert.equal(state.phase, "settlement");

  const bobViewSettlement = redactGameStateForPlayer(state, "secret_bob_id");
  // Bob and Charlie went to Side Game showdown, so they see each other's side game hands
  assert.ok(bobViewSettlement.players[2].hand.every((card) => card !== null));
  assert.ok(bobViewSettlement.players[2].sideEvaluation !== null);
  // Alice won the main pot uncontested (no showdown), so Alice's hole cards STILL stay mucked to Bob!
  assert.ok(bobViewSettlement.players[0].hand.every((card) => card === null));
  // Settlement keys use anonymized seat IDs for opponents
  assert.deepEqual(bobViewSettlement.settlement?.mainPotResult.winnerIds, ["seat_0"]);
});

