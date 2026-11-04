import type {
  Card,
  GameState,
  MainPotResult,
  OmahaHandEvaluation,
  Player,
  Rank,
  Settlement,
  SideGameMatchup,
  SideHandArrangement,
  SideHandEvaluation,
  Suit,
  TwoCardBoardEvaluation,
} from "./game-types";

export const SUITS: Suit[] = ["C", "D", "H", "S"];
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
export const TURN_TIMEOUT_MS = 30_000;
export const SIDE_TIMEOUT_MS = 60_000;

export function pokerRank(r: Rank): number {
  return r === 1 ? 14 : r;
}

export function rankLabel(r: Rank | number): string {
  if (r === 1 || r === 14) return "A";
  if (r === 13) return "K";
  if (r === 12) return "Q";
  if (r === 11) return "J";
  return r.toString();
}

export function rankPluralLabel(r: Rank | number): string {
  const lbl = rankLabel(r);
  if (lbl === "6") return "Sixes";
  if (lbl === "A") return "Aces";
  if (lbl === "K") return "Kings";
  if (lbl === "Q") return "Queens";
  if (lbl === "J") return "Jacks";
  return `${lbl}s`;
}

export function suitSymbol(s: Suit): string {
  switch (s) {
    case "C":
      return "♣";
    case "D":
      return "♦";
    case "H":
      return "♥";
    case "S":
      return "♠";
  }
}

export function cardToString(card: Card): string {
  return `${rankLabel(card.r)}${suitSymbol(card.s)}`;
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.r === b.r && a.s === b.s;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push({ r, s });
    }
  }
  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function sortCardsForDisplay(cards: Card[]): Card[] {
  const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
  return [...cards].sort((a, b) => {
    const prDiff = pokerRank(b.r) - pokerRank(a.r);
    if (prDiff !== 0) return prDiff;
    return suitOrder[a.s] - suitOrder[b.s];
  });
}

// ============================================================================
// 5-Card Poker & PLO5 (2 from hand + 3 from board) Evaluator
// ============================================================================

interface FiveCardEval {
  categoryRank: number; // 1..9
  categoryName: string;
  tiebreakers: number[];
  label: string;
}

export function evaluateFiveCardPokerHand(cards: Card[]): FiveCardEval {
  if (cards.length !== 5) {
    throw new Error("evaluateFiveCardPokerHand requires exactly 5 cards");
  }

  const ranksDesc = cards.map((c) => pokerRank(c.r)).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.s === cards[0].s);

  // Check Straight (including A-2-3-4-5 wheel)
  const uniqueRanks = Array.from(new Set(ranksDesc));
  let isStraight = false;
  let straightHigh = 0;

  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5; // 5-high straight (wheel)
    }
  }

  if (isFlush && isStraight) {
    const isRoyal = straightHigh === 14;
    return {
      categoryRank: 9,
      categoryName: isRoyal ? "Royal Flush" : "Straight Flush",
      tiebreakers: [straightHigh],
      label: isRoyal
        ? "Royal Flush"
        : `Straight Flush, ${rankLabel(straightHigh)}-high`,
    };
  }

  // Count frequencies of each pokerRank
  const counts = new Map<number, number>();
  for (const r of ranksDesc) {
    counts.set(r, (counts.get(r) || 0) + 1);
  }

  // Sort groups by (count desc, rank desc)
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (groups[0][1] === 4) {
    const quadRank = groups[0][0];
    const kicker = groups[1][0];
    return {
      categoryRank: 8,
      categoryName: "Four of a Kind",
      tiebreakers: [quadRank, kicker],
      label: `Four of a Kind, ${rankPluralLabel(quadRank)}`,
    };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const tripRank = groups[0][0];
    const pairRank = groups[1][0];
    return {
      categoryRank: 7,
      categoryName: "Full House",
      tiebreakers: [tripRank, pairRank],
      label: `Full House, ${rankPluralLabel(tripRank)} full of ${rankPluralLabel(pairRank)}`,
    };
  }

  if (isFlush) {
    return {
      categoryRank: 6,
      categoryName: "Flush",
      tiebreakers: ranksDesc,
      label: `Flush, ${rankLabel(ranksDesc[0])}-high`,
    };
  }

  if (isStraight) {
    return {
      categoryRank: 5,
      categoryName: "Straight",
      tiebreakers: [straightHigh],
      label: `Straight, ${rankLabel(straightHigh)}-high`,
    };
  }

  if (groups[0][1] === 3) {
    const tripRank = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      categoryRank: 4,
      categoryName: "Three of a Kind",
      tiebreakers: [tripRank, ...kickers],
      label: `Three of a Kind, ${rankPluralLabel(tripRank)}`,
    };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = groups[0][0];
    const lowPair = groups[1][0];
    const kicker = groups[2][0];
    return {
      categoryRank: 3,
      categoryName: "Two Pair",
      tiebreakers: [highPair, lowPair, kicker],
      label: `Two Pair, ${rankPluralLabel(highPair)} & ${rankPluralLabel(lowPair)}`,
    };
  }

  if (groups[0][1] === 2) {
    const pairRank = groups[0][0];
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      categoryRank: 2,
      categoryName: "One Pair",
      tiebreakers: [pairRank, ...kickers],
      label: `Pair of ${rankPluralLabel(pairRank)}`,
    };
  }

  return {
    categoryRank: 1,
    categoryName: "High Card",
    tiebreakers: ranksDesc,
    label: `High Card, ${rankLabel(ranksDesc[0])}`,
  };
}

export function compareOmahaHands(
  a: Pick<OmahaHandEvaluation, "categoryRank" | "tiebreakers">,
  b: Pick<OmahaHandEvaluation, "categoryRank" | "tiebreakers">,
): number {
  if (a.categoryRank !== b.categoryRank) {
    return a.categoryRank - b.categoryRank;
  }
  const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
  for (let i = 0; i < len; i++) {
    const va = a.tiebreakers[i] ?? 0;
    const vb = b.tiebreakers[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export function evaluateBestOmahaHand(
  holeCards: Card[],
  communityCards: Card[],
): OmahaHandEvaluation {
  if (holeCards.length < 2 || communityCards.length < 3) {
    throw new Error("Need at least 2 hole cards and 3 community cards for Omaha evaluation");
  }

  let bestEval: OmahaHandEvaluation | null = null;

  // Choose 2 from holeCards
  for (let i = 0; i < holeCards.length; i++) {
    for (let j = i + 1; j < holeCards.length; j++) {
      const holePair: [Card, Card] = [holeCards[i], holeCards[j]];

      // Choose 3 from communityCards
      for (let a = 0; a < communityCards.length; a++) {
        for (let b = a + 1; b < communityCards.length; b++) {
          for (let c = b + 1; c < communityCards.length; c++) {
            const boardTrio: [Card, Card, Card] = [
              communityCards[a],
              communityCards[b],
              communityCards[c],
            ];
            const fiveCards = [...holePair, ...boardTrio];
            const fiveEval = evaluateFiveCardPokerHand(fiveCards);

            const candidate: OmahaHandEvaluation = {
              ...fiveEval,
              bestFive: fiveCards,
              holeCardsUsed: holePair,
              boardCardsUsed: boardTrio,
            };

            if (!bestEval || compareOmahaHands(candidate, bestEval) > 0) {
              bestEval = candidate;
            }
          }
        }
      }
    }
  }

  return bestEval!;
}

// ============================================================================
// Side Game (2-Board Chinese / Baccarat + Pairs + 82 + 3-Joker + Popo/KK/Quads)
// ============================================================================

export function baccaratCardValue(r: Rank): number {
  if (r === 1) return 1;
  if (r >= 10) return 0;
  return r;
}

/**
 * Evaluates a 2-card board in the Side Game.
 * Hierarchy:
 * 1. Pair (AA=114 > KK=113 > ... > 22=102)
 * 2. 82 Special (score = 50)
 * 3. Baccarat point 9..0 (score = 0..9)
 * Note: Rank 3 is a wild joker in the side game!
 */
export function evaluateTwoCardBoard(cards: [Card, Card]): TwoCardBoardEvaluation {
  const [c1, c2] = cards;
  const w1 = c1.r === 3;
  const w2 = c2.r === 3;

  // Both cards are wild 3s -> Pair of Aces (AA)
  if (w1 && w2) {
    return {
      cards,
      kind: "pair",
      score: 114,
      pairRank: 14,
      label: "Pair of Aces (3★3★)",
    };
  }

  // One card is a wild 3 -> pairs with the other card to make a Pair!
  if (w1 || w2) {
    const natural = w1 ? c2 : c1;
    const pr = pokerRank(natural.r);
    return {
      cards,
      kind: "pair",
      score: 100 + pr,
      pairRank: pr,
      label: `Pair of ${rankPluralLabel(pr)} (3★)`,
    };
  }

  // Neither card is a 3
  if (c1.r === c2.r) {
    const pr = pokerRank(c1.r);
    return {
      cards,
      kind: "pair",
      score: 100 + pr,
      pairRank: pr,
      label: `Pair of ${rankPluralLabel(pr)}`,
    };
  }

  // Check 82 special hand
  if ((c1.r === 8 && c2.r === 2) || (c1.r === 2 && c2.r === 8)) {
    return {
      cards,
      kind: "eight_two",
      score: 50,
      label: "82 Special",
    };
  }

  // Baccarat point
  const bacVal = (baccaratCardValue(c1.r) + baccaratCardValue(c2.r)) % 10;
  return {
    cards,
    kind: "baccarat",
    score: bacVal,
    baccaratValue: bacVal,
    label: `Baccarat ${bacVal}`,
  };
}

/**
 * Checks whether 4 cards (with 3 as wild) form King Kong: {10, J, Q, K}.
 */
export function isKingKongFourCards(fourCards: Card[]): boolean {
  if (fourCards.length !== 4) return false;
  const kingKongRanks = new Set<number>([10, 11, 12, 13]);
  const seenNaturals = new Set<number>();

  for (const c of fourCards) {
    if (c.r === 3) continue; // wild joker can fill any missing rank in {10, J, Q, K}
    if (!kingKongRanks.has(c.r)) return false;
    if (seenNaturals.has(c.r)) return false; // duplicate rank means not 10-J-Q-K
    seenNaturals.add(c.r);
  }
  return true;
}

/**
 * Evaluates a player's chosen SideHandArrangement (two 2-card boards + 1 unused card).
 * Automatically orders highBoard >= lowBoard so player doesn't accidentally invert them.
 */
export function evaluateSideArrangement(
  arrangement: SideHandArrangement,
): SideHandEvaluation {
  const eval1 = evaluateTwoCardBoard(arrangement.highBoard);
  const eval2 = evaluateTwoCardBoard(arrangement.lowBoard);

  const [highEval, lowEval, highBoard, lowBoard] =
    eval1.score >= eval2.score
      ? [eval1, eval2, arrangement.highBoard, arrangement.lowBoard]
      : [eval2, eval1, arrangement.lowBoard, arrangement.highBoard];

  const normalizedArrangement: SideHandArrangement = {
    highBoard,
    lowBoard,
    unusedCard: arrangement.unusedCard,
  };

  const fourCards = [...highBoard, ...lowBoard];

  // Resolve wildcards across all four cards before optimizing each board separately.
  const naturals = fourCards.filter(c => c.r !== 3);
  if (naturals.every(c => c.r === naturals[0].r)) {
    const qRank = pokerRank(naturals[0]?.r ?? 1);
    return {
      arrangement: normalizedArrangement,
      tier: "quads",
      multiplier: 7,
      quadRank: qRank,
      highEval: { ...highEval, kind: "pair", score: 100 + qRank, pairRank: qRank, label: `Pair of ${rankPluralLabel(qRank)}` },
      lowEval: { ...lowEval, kind: "pair", score: 100 + qRank, pairRank: qRank, label: `Pair of ${rankPluralLabel(qRank)}` },
      tierLabel: `Quads ${rankPluralLabel(qRank)} (7x)`,
    };
  }

  // 2. Check King Kong (5x): the 4 used cards form 10-J-Q-K (with 3 wild)
  if (isKingKongFourCards(fourCards)) {
    return {
      arrangement: normalizedArrangement,
      tier: "king_kong",
      multiplier: 5,
      highEval,
      lowEval,
      tierLabel: "King Kong 10-J-Q-K (5x)",
    };
  }

  // 3. Check Popo (4x): both boards are pairs (of different ranks)
  if (highEval.kind === "pair" && lowEval.kind === "pair") {
    return {
      arrangement: normalizedArrangement,
      tier: "popo",
      multiplier: 4,
      highEval,
      lowEval,
      tierLabel: `Popo ${rankLabel(highEval.pairRank!)}${rankLabel(highEval.pairRank!)} & ${rankLabel(lowEval.pairRank!)}${rankLabel(lowEval.pairRank!)} (4x)`,
    };
  }

  // 4. Normal Hand (2x)
  return {
    arrangement: normalizedArrangement,
    tier: "normal",
    multiplier: 2,
    highEval,
    lowEval,
    tierLabel: `${highEval.label} / ${lowEval.label} (2x)`,
  };
}

function sideTierOrder(tier: SideHandEvaluation["tier"]): number {
  switch (tier) {
    case "quads":
      return 4;
    case "king_kong":
      return 3;
    case "popo":
      return 2;
    case "normal":
      return 1;
  }
}

/**
 * Computes a heuristic quality score for sorting candidate arrangements of a single player's 5 cards.
 */
function arrangementHeuristicScore(ev: SideHandEvaluation): number {
  const tierOrd = sideTierOrder(ev.tier);
  if (ev.tier === "quads") {
    return tierOrd * 1_000_000 + (ev.quadRank ?? 0) * 1_000;
  }
  if (ev.tier === "king_kong") {
    return tierOrd * 1_000_000;
  }
  // For popo and normal, prioritize balanced board strength + high board + low board
  // Wait: in AAK9Q, AA (114) + K9 (9) -> high=114, low=9.
  return tierOrd * 1_000_000 + ev.highEval.score * 500 + ev.lowEval.score;
}

/**
 * Searches all 15 ways to arrange 5 cards into two 2-card boards + 1 unused card
 * and returns the best SideHandEvaluation.
 */
export function computeBestSideArrangement(fiveCards: Card[]): SideHandEvaluation {
  if (fiveCards.length !== 5) {
    throw new Error("computeBestSideArrangement requires exactly 5 cards");
  }

  let best: SideHandEvaluation | null = null;
  let bestScore = -1;

  for (let unusedIdx = 0; unusedIdx < 5; unusedIdx++) {
    const unusedCard = fiveCards[unusedIdx];
    const rem = fiveCards.filter((_, idx) => idx !== unusedIdx);

    const partitions: [[Card, Card], [Card, Card]][] = [
      [
        [rem[0], rem[1]],
        [rem[2], rem[3]],
      ],
      [
        [rem[0], rem[2]],
        [rem[1], rem[3]],
      ],
      [
        [rem[0], rem[3]],
        [rem[1], rem[2]],
      ],
    ];

    for (const [b1, b2] of partitions) {
      const candidate = evaluateSideArrangement({
        highBoard: b1,
        lowBoard: b2,
        unusedCard,
      });
      const score = arrangementHeuristicScore(candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }

  return best!;
}

/**
 * Compares two folding players' SideHandEvaluations 1v1 according to POF rules:
 * - Quads (7x) > King Kong (5x) > Popo (4x) > Normal (2x) auto-win against lower tiers.
 * - Quads vs Quads: higher quad rank wins 7x; equal pushes.
 * - King Kong vs King Kong: pushes.
 * - Popo vs Popo: must strictly win BOTH pairs (high > high && low > low) to win 4x; else push.
 * - Normal vs Normal: must strictly win BOTH boards (high > high && low > low) to win 2x; else push.
 */
export function compareSideHands1v1(
  playerA: { id: string; name: string; eval: SideHandEvaluation },
  playerB: { id: string; name: string; eval: SideHandEvaluation },
  ante: number,
): SideGameMatchup {
  const evalA = playerA.eval;
  const evalB = playerB.eval;
  const tierA = sideTierOrder(evalA.tier);
  const tierB = sideTierOrder(evalB.tier);

  // Different tiers -> higher tier auto-wins!
  if (tierA !== tierB) {
    const aWins = tierA > tierB;
    const winner = aWins ? playerA : playerB;
    const loser = aWins ? playerB : playerA;
    const mult = winner.eval.multiplier;
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: winner.id,
      multiplier: mult,
      chipAmount: mult * ante,
      reason: `${winner.name}'s ${winner.eval.tierLabel} auto-beats ${loser.name}'s ${loser.eval.tierLabel}`,
    };
  }

  // Same tier
  if (evalA.tier === "quads" && evalB.tier === "quads") {
    const rA = evalA.quadRank ?? 0;
    const rB = evalB.quadRank ?? 0;
    if (rA === rB) {
      return {
        playerAId: playerA.id,
        playerAName: playerA.name,
        playerBId: playerB.id,
        playerBName: playerB.name,
        winnerId: null,
        multiplier: 0,
        chipAmount: 0,
        reason: `Push — equal ${evalA.tierLabel}`,
      };
    }
    const aWins = rA > rB;
    const winner = aWins ? playerA : playerB;
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: winner.id,
      multiplier: 7,
      chipAmount: 7 * ante,
      reason: `${winner.name} wins higher Quads (${winner.eval.tierLabel})`,
    };
  }

  if (evalA.tier === "king_kong" && evalB.tier === "king_kong") {
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: null,
      multiplier: 0,
      chipAmount: 0,
      reason: "Push — both players have King Kong (10-J-Q-K)",
    };
  }

  // Popo vs Popo (4x full / 2x half) or Normal vs Normal (2x full / 1x half)
  const fullMult = evalA.tier === "popo" ? 4 : 2;
  const halfMult = fullMult / 2;
  const aWinsHigh = evalA.highEval.score > evalB.highEval.score;
  const aWinsLow = evalA.lowEval.score > evalB.lowEval.score;
  const bWinsHigh = evalB.highEval.score > evalA.highEval.score;
  const bWinsLow = evalB.lowEval.score > evalA.lowEval.score;
  const highTied = evalA.highEval.score === evalB.highEval.score;
  const lowTied = evalA.lowEval.score === evalB.lowEval.score;

  if (aWinsHigh && aWinsLow) {
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: playerA.id,
      multiplier: fullMult,
      chipAmount: fullMult * ante,
      reason: `${playerA.name} wins both boards (${evalA.highEval.label} > ${evalB.highEval.label} & ${evalA.lowEval.label} > ${evalB.lowEval.label})`,
    };
  }

  if (bWinsHigh && bWinsLow) {
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: playerB.id,
      multiplier: fullMult,
      chipAmount: fullMult * ante,
      reason: `${playerB.name} wins both boards (${evalB.highEval.label} > ${evalA.highEval.label} & ${evalB.lowEval.label} > ${evalA.lowEval.label})`,
    };
  }

  // Win 1 board + Tie 1 board -> half multiplier (1x for Normal, 2x for Popo)
  if ((aWinsHigh && lowTied) || (highTied && aWinsLow)) {
    const wonBoardDesc = aWinsHigh
      ? `high board (${evalA.highEval.label} > ${evalB.highEval.label}), low tied (${evalA.lowEval.label})`
      : `low board (${evalA.lowEval.label} > ${evalB.lowEval.label}), high tied (${evalA.highEval.label})`;
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: playerA.id,
      multiplier: halfMult,
      chipAmount: halfMult * ante,
      reason: `${playerA.name} wins ${wonBoardDesc}`,
    };
  }

  if ((bWinsHigh && lowTied) || (highTied && bWinsLow)) {
    const wonBoardDesc = bWinsHigh
      ? `high board (${evalB.highEval.label} > ${evalA.highEval.label}), low tied (${evalB.lowEval.label})`
      : `low board (${evalB.lowEval.label} > ${evalA.lowEval.label}), high tied (${evalB.highEval.label})`;
    return {
      playerAId: playerA.id,
      playerAName: playerA.name,
      playerBId: playerB.id,
      playerBName: playerB.name,
      winnerId: playerB.id,
      multiplier: halfMult,
      chipAmount: halfMult * ante,
      reason: `${playerB.name} wins ${wonBoardDesc}`,
    };
  }

  return {
    playerAId: playerA.id,
    playerAName: playerA.name,
    playerBId: playerB.id,
    playerBName: playerB.name,
    winnerId: null,
    multiplier: 0,
    chipAmount: 0,
    reason: `Push — split/tied boards (${evalA.highEval.label} vs ${evalB.highEval.label}, ${evalA.lowEval.label} vs ${evalB.lowEval.label})`,
  };
}

// ============================================================================
// Room & Game State Engine
// ============================================================================

export function createGame(
  roomCode: string,
  creatorName: string,
  creatorId: string,
  userId?: string,
  ante = 10,
): GameState {
  const creator: Player = {
    id: creatorId,
    name: creatorName,
    connected: true,
    ready: false,
    hand: [],
    chipDelta: 0,
    currentHandDelta: 0,
    potContribution: 0,
    decision: "pending",
    sideArrangement: null,
    sideEvaluation: null,
    sideLocked: false,
    userId,
  };

  return {
    roomCode,
    phase: "lobby",
    players: [creator],
    buttonIdx: 0,
    turnIdx: 0,
    ante,
    initialPot: 0,
    mainPot: 0,
    carryoverPot: 0,
    communityCards: [],
    deck: [],
    settlement: null,
    version: 1,
    roundNumber: 1,
    gameStartTime: Date.now(),
  };
}

export function joinGame(
  state: GameState,
  playerName: string,
  playerId: string,
  userId?: string,
): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Game already in progress");
  }
  if (state.players.length >= 8) {
    throw new Error("Room is full (maximum 8 players)");
  }
  if (state.players.some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
    throw new Error("A player with that name is already in the room");
  }

  const newPlayer: Player = {
    id: playerId,
    name: playerName,
    connected: true,
    ready: false,
    hand: [],
    chipDelta: 0,
    currentHandDelta: 0,
    potContribution: 0,
    decision: "pending",
    sideArrangement: null,
    sideEvaluation: null,
    sideLocked: false,
    userId,
  };

  return {
    ...state,
    players: [...state.players, newPlayer],
    version: state.version + 1,
  };
}

const BOT_NAMES = ["Vegas Bot", "Macau Shark", "Dealer Dan", "Highroller Mia", "GTO Gus", "Lucky Lou", "Ace Aria"];

export function addBotPlayer(state: GameState): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Can only add bots in the lobby");
  }
  if (state.players.length >= 8) {
    throw new Error("Room is full (maximum 8 players)");
  }

  const usedNames = new Set(state.players.map((p) => p.name));
  const botName =
    BOT_NAMES.find((n) => !usedNames.has(n)) || `Bot ${state.players.length + 1}`;

  const botPlayer: Player = {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: botName,
    connected: true,
    ready: true,
    isBot: true,
    hand: [],
    chipDelta: 0,
    currentHandDelta: 0,
    potContribution: 0,
    decision: "pending",
    sideArrangement: null,
    sideEvaluation: null,
    sideLocked: false,
  };

  return {
    ...state,
    players: [...state.players, botPlayer],
    version: state.version + 1,
  };
}

export function removeBotPlayer(state: GameState, botId: string): GameState {
  if (state.phase !== "lobby") {
    throw new Error("Can only remove bots in the lobby");
  }
  const target = state.players.find((p) => p.id === botId);
  if (!target || !target.isBot) {
    throw new Error("Bot not found");
  }
  return {
    ...state,
    players: state.players.filter((p) => p.id !== botId),
    version: state.version + 1,
  };
}

export function setRoomAnte(state: GameState, ante: number): GameState {
  if (state.phase !== "lobby" && state.phase !== "settlement") {
    throw new Error("Ante can only be changed in the lobby or between hands");
  }
  if (!Number.isInteger(ante) || ante < 1 || ante > 10000) {
    throw new Error("Ante must be between 1 and 10,000");
  }
  if (ante === state.ante) return state;
  return {
    ...state,
    ante,
    players: state.players.map(p => ({ ...p, ready: Boolean(p.isBot) })),
    version: state.version + 1,
  };
}

export function togglePlayerReady(state: GameState, playerId: string): GameState {
  if (state.phase !== "lobby" && state.phase !== "settlement") {
    throw new Error("Cannot change ready state during a hand");
  }

  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) {
    throw new Error("Player not found");
  }

  const updatedPlayers = [...state.players];
  updatedPlayers[idx] = {
    ...updatedPlayers[idx],
    ready: !updatedPlayers[idx].ready,
    sittingOut: false,
  };

  return {
    ...state,
    players: updatedPlayers,
    version: state.version + 1,
  };
}

/**
 * Starts a new hand (either from lobby or from settlement for next hand).
 * - Moves button clockwise on round > 1
 * - Collects ante from every player
 * - Deals 5 hole cards to each player
 * - Deals 3 flop cards to communityCards
 * - Action starts on the button (`turnIdx = buttonIdx`)
 */
export function startRound(state: GameState): GameState {
  if (state.phase !== "lobby" && state.phase !== "settlement") {
    throw new Error("Cannot redeal an unfinished hand");
  }
  const participants = state.players.filter(p => !p.sittingOut && p.connected);
  if (participants.length < 2) {
    throw new Error("Need at least 2 players to start");
  }
  if (!participants.every((p) => p.ready)) {
    throw new Error("All players must be ready to start");
  }

  const deck = createDeck();
  const numPlayers = state.players.length;
  const nextRoundNumber = state.phase === "lobby" ? 1 : state.roundNumber + 1;
  let buttonIdx = state.phase === "lobby" ? 0 : (state.buttonIdx + 1) % numPlayers;
  while (!state.players[buttonIdx].connected || state.players[buttonIdx].sittingOut) {
    buttonIdx = (buttonIdx + 1) % numPlayers;
  }

  const ante = state.ante;
  const anteTotal = participants.length * ante;
  const initialPot = state.carryoverPot + anteTotal;

  let deckCursor = 0;
  const players: Player[] = state.players.map((p) => {
    if (!p.connected || p.sittingOut) {
      return { ...p, sittingOut: true, ready: false, hand: [], currentHandDelta: 0, potContribution: 0, decision: "pending", sideArrangement: null, sideEvaluation: null, sideLocked: false };
    }
    const hand = sortCardsForDisplay(deck.slice(deckCursor, deckCursor + 5));
    deckCursor += 5;
    return {
      ...p,
      hand,
      currentHandDelta: -ante,
      potContribution: ante,
      decision: "pending",
      sideArrangement: null,
      sideEvaluation: null,
      sideLocked: false,
    };
  });

  // Deal 3 flop cards
  const communityCards = deck.slice(deckCursor, deckCursor + 3);
  deckCursor += 3;

  const remainingDeck = deck.slice(deckCursor);

  let nextState: GameState = {
    ...state,
    phase: "pot_or_fold",
    players,
    buttonIdx,
    turnIdx: buttonIdx,
    initialPot,
    mainPot: initialPot,
    communityCards,
    deck: remainingDeck,
    settlement: null,
    roundNumber: nextRoundNumber,
    actionDeadline: Date.now() + TURN_TIMEOUT_MS,
    version: state.version + 1,
  };

  // If the starting player on the button is a bot, process bot turns automatically
  nextState = advanceBotsIfNeeded(nextState);
  return nextState;
}

/**
 * Smart bot decision logic for Pot or Fold:
 * Evaluates flop Omaha strength and Side Game strength to decide whether to POT or FOLD.
 */
function chooseBotFlopDecision(bot: Player, communityCards: Card[]): "pot" | "fold" {
  const hand = bot.hand.filter((c): c is Card => c !== null);
  if (hand.length < 5) return "fold";

  const sideEval = computeBestSideArrangement(hand);
  // If bot has a monster side hand (Quads, King Kong, or Popo), folding into the side game is very lucrative!
  if (sideEval.tier !== "normal") {
    return "fold";
  }

  const omahaFlop = evaluateBestOmahaHand(hand, communityCards);
  // Pot if Three of a Kind or better, or strong Two Pair
  if (omahaFlop.categoryRank >= 4) return "pot";
  if (omahaFlop.categoryRank === 3 && omahaFlop.tiebreakers[0] >= 10) return "pot";
  if (omahaFlop.categoryRank === 2 && omahaFlop.tiebreakers[0] >= 13 && sideEval.highEval.score < 110) {
    return "pot";
  }
  return "fold";
}

function advanceBotsIfNeeded(state: GameState): GameState {
  let curr = state;
  let safety = 0;
  while (
    curr.phase === "pot_or_fold" &&
    (curr.players[curr.turnIdx]?.isBot || curr.players[curr.turnIdx]?.sittingOut || !curr.players[curr.turnIdx]?.connected) &&
    curr.players[curr.turnIdx]?.decision === "pending" &&
    safety < 16
  ) {
    safety++;
    const bot = curr.players[curr.turnIdx];
    const decision = bot.isBot && !bot.sittingOut ? chooseBotFlopDecision(bot, curr.communityCards) : "fold";
    curr = applyFlopDecisionInternal(curr, bot.id, decision);
  }
  return curr;
}

export function applyFlopDecision(
  state: GameState,
  playerId: string,
  decision: "pot" | "fold",
): GameState {
  if (state.actionDeadline && Date.now() >= state.actionDeadline) {
    throw new Error("Turn deadline has expired");
  }
  let next = applyFlopDecisionInternal(state, playerId, decision);
  next = advanceBotsIfNeeded(next);
  return next;
}

function applyFlopDecisionInternal(
  state: GameState,
  playerId: string,
  decision: "pot" | "fold",
): GameState {
  if (state.phase !== "pot_or_fold") {
    throw new Error("Not in Pot or Fold phase");
  }

  const currentPlayer = state.players[state.turnIdx];
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error("Not your turn");
  }
  if (currentPlayer.decision !== "pending") {
    throw new Error("Player already acted this street");
  }

  const potMatchAmount = decision === "pot" ? state.initialPot : 0;

  const updatedPlayers = [...state.players];
  updatedPlayers[state.turnIdx] = {
    ...currentPlayer,
    decision,
    potContribution: currentPlayer.potContribution + potMatchAmount,
    currentHandDelta: currentPlayer.currentHandDelta - potMatchAmount,
  };

  const updatedMainPot = state.mainPot + potMatchAmount;

  // Check if any player still has decision === 'pending'
  const numPlayers = updatedPlayers.length;
  let nextTurnIdx = -1;
  for (let offset = 1; offset <= numPlayers; offset++) {
    const candidateIdx = (state.turnIdx + offset) % numPlayers;
    if (updatedPlayers[candidateIdx].decision === "pending" && updatedPlayers[candidateIdx].hand.length === 5) {
      nextTurnIdx = candidateIdx;
      break;
    }
  }

  const baseState: GameState = {
    ...state,
    players: updatedPlayers,
    mainPot: updatedMainPot,
    turnIdx: nextTurnIdx !== -1 ? nextTurnIdx : state.turnIdx,
    actionDeadline: Date.now() + TURN_TIMEOUT_MS,
    version: state.version + 1,
  };

  if (nextTurnIdx !== -1) {
    return baseState;
  }

  // All players have acted! Resolve main pot and check if Side Game phase is needed.
  return transitionAfterAllFlopDecisions(baseState);
}

function transitionAfterAllFlopDecisions(state: GameState): GameState {
  const potPlayers = state.players.filter((p) => p.decision === "pot");
  const foldPlayers = state.players.filter((p) => p.decision === "fold");

  // If 2 or more players potted, deal Turn and River (2 more community cards)
  let communityCards = [...state.communityCards];
  let deck = [...state.deck];
  if (potPlayers.length >= 2 && communityCards.length < 5) {
    const needed = 5 - communityCards.length;
    const drawn = deck.slice(0, needed).filter((c): c is Card => c !== null);
    communityCards = [...communityCards, ...drawn];
    deck = deck.slice(needed);
  }

  // Pre-populate optimal SideHandArrangement for all folding players
  const updatedPlayers = state.players.map((p) => {
    if (p.decision !== "fold") return p;
    const validCards = p.hand.filter((c): c is Card => c !== null);
    const bestSide = computeBestSideArrangement(validCards);
    return {
      ...p,
      sideArrangement: bestSide.arrangement,
      sideEvaluation: bestSide,
      // Bots automatically lock in their optimal side hand
      sideLocked: Boolean(p.isBot || p.sittingOut || !p.connected),
    };
  });

  const nextState: GameState = {
    ...state,
    players: updatedPlayers,
    communityCards,
    deck,
  };

  // If 2 or more players folded, enter the side_game phase (unless all folding players are bots)
  if (foldPlayers.length >= 2) {
    const allFoldersLocked = nextState.players
      .filter((p) => p.decision === "fold")
      .every((p) => p.sideLocked);

    if (!allFoldersLocked) {
      return {
        ...nextState,
        phase: "side_game",
        actionDeadline: Date.now() + SIDE_TIMEOUT_MS,
        version: state.version + 1,
      };
    }
  }

  // Otherwise, finalize settlement immediately
  return finalizeSettlement(nextState);
}

/**
 * Allows a folding player in the `side_game` phase to update and/or lock in their 2-board arrangement.
 */
export function submitSideHand(
  state: GameState,
  playerId: string,
  arrangement?: SideHandArrangement,
): GameState {
  if (state.phase !== "side_game") {
    throw new Error("Not in Side Game phase");
  }
  if (state.actionDeadline && Date.now() >= state.actionDeadline) {
    throw new Error("Side game deadline has expired");
  }

  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) {
    throw new Error("Player not found");
  }

  const player = state.players[idx];
  if (player.decision !== "fold") {
    throw new Error("Only players who folded play the side game");
  }

  const validHand = player.hand.filter((c): c is Card => c !== null);
  let chosenEval: SideHandEvaluation;

  if (arrangement) {
    // Verify the 5 cards in arrangement match the player's 5 hole cards
    const arrangedCards = [
      ...arrangement.highBoard,
      ...arrangement.lowBoard,
      arrangement.unusedCard,
    ];
    if (!verifySameFiveCards(validHand, arrangedCards)) {
      throw new Error("Arranged cards do not match player's hand");
    }
    chosenEval = evaluateSideArrangement(arrangement);
  } else {
    chosenEval =
      player.sideEvaluation ?? computeBestSideArrangement(validHand);
  }

  const updatedPlayers = [...state.players];
  updatedPlayers[idx] = {
    ...player,
    sideArrangement: chosenEval.arrangement,
    sideEvaluation: chosenEval,
    sideLocked: true,
  };

  const updatedState: GameState = {
    ...state,
    players: updatedPlayers,
    version: state.version + 1,
  };

  const allFoldedLocked = updatedState.players
    .filter((p) => p.decision === "fold")
    .every((p) => p.sideLocked);

  if (allFoldedLocked) {
    return finalizeSettlement(updatedState);
  }

  return updatedState;
}

function verifySameFiveCards(handA: Card[], handB: Card[]): boolean {
  if (handA.length !== 5 || handB.length !== 5) return false;
  const key = (c: Card) => `${c.r}-${c.s}`;
  const sortedA = handA.map(key).sort().join(",");
  const sortedB = handB.map(key).sort().join(",");
  return sortedA === sortedB;
}

/**
 * Computes Main Pot payout + all 1v1 Side Game matchups and transitions to `settlement`.
 */
export function finalizeSettlement(state: GameState): GameState {
  const potPlayers = state.players.filter((p) => p.decision === "pot");
  const foldPlayers = state.players.filter((p) => p.decision === "fold");

  // 1. Main Pot Resolution
  let mainPotResult: MainPotResult;
  let nextCarryoverPot = 0;
  const mainPotGrossWinnings: Record<string, number> = {};
  for (const p of state.players) {
    mainPotGrossWinnings[p.id] = 0;
  }

  if (potPlayers.length === 0) {
    // Everyone folded -> Main Pot rolls over to the next hand!
    nextCarryoverPot = state.mainPot;
    mainPotResult = {
      outcome: "rollover",
      potAmount: state.mainPot,
      winnerIds: [],
      payoutPerWinner: 0,
      playerEvaluations: {},
    };
  } else if (potPlayers.length === 1) {
    // 1 player potted -> wins uncontested
    const winner = potPlayers[0];
    mainPotGrossWinnings[winner.id] = state.mainPot;
    mainPotResult = {
      outcome: "uncontested",
      potAmount: state.mainPot,
      winnerIds: [winner.id],
      payoutPerWinner: state.mainPot,
      playerEvaluations: {},
    };
  } else {
    // 2+ players potted -> PLO5 Showdown (2 from hand + 3 from communityCards)
    const evaluations: Record<string, OmahaHandEvaluation> = {};
    let bestHand: OmahaHandEvaluation | null = null;
    let winnerIds: string[] = [];

    for (const p of potPlayers) {
      const validHand = p.hand.filter((c): c is Card => c !== null);
      const ev = evaluateBestOmahaHand(validHand, state.communityCards);
      evaluations[p.id] = ev;

      if (!bestHand) {
        bestHand = ev;
        winnerIds = [p.id];
      } else {
        const cmp = compareOmahaHands(ev, bestHand);
        if (cmp > 0) {
          bestHand = ev;
          winnerIds = [p.id];
        } else if (cmp === 0) {
          winnerIds.push(p.id);
        }
      }
    }

    const baseShare = Math.floor(state.mainPot / winnerIds.length);
    let remainder = state.mainPot - baseShare * winnerIds.length;

    for (const wId of winnerIds) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      mainPotGrossWinnings[wId] = baseShare + extra;
    }

    mainPotResult = {
      outcome: "showdown",
      potAmount: state.mainPot,
      winnerIds,
      payoutPerWinner: baseShare,
      playerEvaluations: evaluations,
    };
  }

  // Net Main Pot delta for each player = gross winnings - potContribution
  const mainPotDeltas: Record<string, number> = {};
  for (const p of state.players) {
    mainPotDeltas[p.id] = (mainPotGrossWinnings[p.id] || 0) - p.potContribution;
  }

  // 2. Side Game 1v1 Resolution among all folding players
  const sideGameDeltas: Record<string, number> = {};
  for (const p of state.players) {
    sideGameDeltas[p.id] = 0;
  }

  const sideMatchups: SideGameMatchup[] = [];
  if (foldPlayers.length >= 2) {
    for (let i = 0; i < foldPlayers.length; i++) {
      for (let j = i + 1; j < foldPlayers.length; j++) {
        const pA = foldPlayers[i];
        const pB = foldPlayers[j];
        const evalA =
          pA.sideEvaluation ??
          computeBestSideArrangement(pA.hand.filter((c): c is Card => c !== null));
        const evalB =
          pB.sideEvaluation ??
          computeBestSideArrangement(pB.hand.filter((c): c is Card => c !== null));

        const matchup = compareSideHands1v1(
          { id: pA.id, name: pA.name, eval: evalA },
          { id: pB.id, name: pB.name, eval: evalB },
          state.ante,
        );
        sideMatchups.push(matchup);

        if (matchup.winnerId === pA.id) {
          sideGameDeltas[pA.id] += matchup.chipAmount;
          sideGameDeltas[pB.id] -= matchup.chipAmount;
        } else if (matchup.winnerId === pB.id) {
          sideGameDeltas[pB.id] += matchup.chipAmount;
          sideGameDeltas[pA.id] -= matchup.chipAmount;
        }
      }
    }
  }

  // 3. Combine Total Hand Deltas & Update Cumulative Player Stacks
  const totalRoundDeltas: Record<string, number> = {};
  const payouts: number[] = [];

  const updatedPlayers = state.players.map((p) => {
    const handNet = (mainPotDeltas[p.id] || 0) + (sideGameDeltas[p.id] || 0);
    totalRoundDeltas[p.id] = handNet;
    payouts.push(handNet);
    return {
      ...p,
      currentHandDelta: handNet,
      chipDelta: p.chipDelta + handNet,
      ready: Boolean(p.isBot),
    };
  });

  const settlement: Settlement = {
    ante: state.ante,
    mainPotResult,
    sideMatchups,
    mainPotDeltas,
    sideGameDeltas,
    totalRoundDeltas,
    payouts,
  };

  return {
    ...state,
    phase: "settlement",
    actionDeadline: null,
    players: updatedPlayers,
    carryoverPot: nextCarryoverPot,
    settlement,
    version: state.version + 1,
  };
}

export function isTableHost(state: GameState, playerId: string): boolean {
  return state.players.find(p => !p.isBot && !p.sittingOut && p.connected)?.id === playerId;
}

export function expireGameActions(state: GameState, now = Date.now()): GameState {
  if (state.phase !== "pot_or_fold" && state.phase !== "side_game") return state;
  // Rooms saved before deadlines were introduced receive one recovery window.
  if (!state.actionDeadline) {
    return { ...state, actionDeadline: now + (state.phase === "pot_or_fold" ? TURN_TIMEOUT_MS : SIDE_TIMEOUT_MS), version: state.version + 1 };
  }
  if (now < state.actionDeadline) return state;
  if (state.phase === "pot_or_fold") {
    return advanceBotsIfNeeded(applyFlopDecisionInternal(state, state.players[state.turnIdx].id, "fold"));
  }
  return finalizeSettlement({ ...state, players: state.players.map(p => p.decision === "fold" ? { ...p, sideLocked: true } : p) });
}

export function leaveGame(state: GameState, playerId: string): GameState {
  const player = state.players.find(p => p.id === playerId && !p.isBot);
  if (!player) throw new Error("Player not found");
  let next: GameState = { ...state, version: state.version + 1, players: state.players.map(p => p.id === playerId ? { ...p, connected: false, sittingOut: true, ready: false } : p) };
  if (next.phase === "pot_or_fold") next = advanceBotsIfNeeded(next);
  if (next.phase === "side_game") {
    next = { ...next, players: next.players.map(p => p.id === playerId && p.decision === "fold" ? { ...p, sideLocked: true } : p) };
    if (next.players.filter(p => p.decision === "fold").every(p => p.sideLocked)) next = finalizeSettlement(next);
  }
  return next;
}

export function checkInvariants(state: GameState): void {
  if (state.ante < 1) {
    throw new Error("Invariant failed: ante must be >= 1");
  }
  if (state.phase === "pot_or_fold" || state.phase === "side_game") {
    for (const p of state.players) {
      if (!p.sittingOut && p.hand.length !== 5) {
        throw new Error(`Invariant failed: player ${p.name} does not have 5 cards`);
      }
    }
  }
}
