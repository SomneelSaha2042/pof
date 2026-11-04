import { z } from "zod";

// Card types
export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Card {
  r: Rank;
  s: Suit;
}

// Game phases
// lobby: waiting for players to ready up & configure ante
// pot_or_fold: 5 cards dealt to each player, 3 flop cards dealt, players decide 'pot' or 'fold' starting from button
// side_game: folding players (if >= 2) arrange their 5 cards into two 2-card boards (High & Low) + 1 unused card
// settlement: main pot & side game results displayed, ready for next hand
export type Phase = 'lobby' | 'pot_or_fold' | 'side_game' | 'settlement';

export type PlayerDecision = 'pending' | 'pot' | 'fold';

export type SideGameTier = 'normal' | 'popo' | 'king_kong' | 'quads';

export type TwoCardBoardKind = 'pair' | 'eight_two' | 'baccarat';

export interface TwoCardBoardEvaluation {
  cards: [Card, Card];
  kind: TwoCardBoardKind;
  score: number; // Pair: 102..114, 82: 50, Baccarat: 0..9
  pairRank?: number; // poker rank 2..14 if kind === 'pair'
  baccaratValue?: number; // 0..9 if kind === 'baccarat'
  label: string; // e.g. "Pair of Aces", "82 Special", "Baccarat 9"
}

export interface SideHandArrangement {
  highBoard: [Card, Card];
  lowBoard: [Card, Card];
  unusedCard: Card;
}

export interface SideHandEvaluation {
  arrangement: SideHandArrangement;
  tier: SideGameTier;
  multiplier: number; // 2 for normal, 4 for popo, 5 for king_kong, 7 for quads
  quadRank?: number; // poker rank 2..14 when tier === 'quads'
  highEval: TwoCardBoardEvaluation;
  lowEval: TwoCardBoardEvaluation;
  tierLabel: string; // e.g. "Quads (7x)", "King Kong (5x)", "Popo (4x)", "AA / K9 (2x)"
}

export interface OmahaHandEvaluation {
  categoryRank: number; // 1 (High Card) .. 9 (Straight Flush)
  categoryName: string; // e.g. "Full House", "Flush"
  tiebreakers: number[]; // descending poker ranks for tie-breaking
  bestFive: Card[];
  holeCardsUsed: [Card, Card];
  boardCardsUsed: [Card, Card, Card];
  label: string; // e.g. "Full House, Aces full of Kings"
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  isBot?: boolean;
  hand: (Card | null)[];
  chipDelta: number; // cumulative net chips across all hands
  currentHandDelta: number; // net chips won/lost in the current hand
  potContribution: number; // chips put into main pot this hand (ante + optional pot match)
  decision: PlayerDecision;
  sideArrangement?: SideHandArrangement | null;
  sideEvaluation?: SideHandEvaluation | null;
  sideLocked: boolean;
  userId?: string;
}

export interface MainPotResult {
  outcome: 'rollover' | 'uncontested' | 'showdown';
  potAmount: number;
  winnerIds: string[];
  payoutPerWinner: number;
  playerEvaluations: Record<string, OmahaHandEvaluation>;
}

export interface SideGameMatchup {
  playerAId: string;
  playerAName: string;
  playerBId: string;
  playerBName: string;
  winnerId: string | null; // null means push
  multiplier: number; // 0 on push, otherwise 2, 4, 5, or 7
  chipAmount: number; // multiplier * ante
  reason: string; // e.g. "Popo (4x) auto-beats Normal hand", "AA > JJ and 82 > K9 (2x)", "Push (AA > JJ, 22 < 88)"
}

export interface Settlement {
  ante: number;
  mainPotResult: MainPotResult;
  sideMatchups: SideGameMatchup[];
  mainPotDeltas: Record<string, number>; // net profit/loss in main pot for each playerId
  sideGameDeltas: Record<string, number>; // net profit/loss in side game for each playerId
  totalRoundDeltas: Record<string, number>; // combined net delta for this hand per playerId
  payouts: number[]; // parallel array to players[] for stats persistence compatibility
}

export interface GameState {
  roomCode: string;
  phase: Phase;
  players: Player[];
  buttonIdx: number;
  turnIdx: number;
  ante: number;
  initialPot: number; // carryoverPot + players.length * ante (the amount needed to POT)
  mainPot: number; // total chips currently in the main pot
  carryoverPot: number; // pot rolled over from previous all-fold hand
  communityCards: Card[]; // 3 on flop, 5 on showdown
  deck: (Card | null)[];
  settlement?: Settlement | null;
  version: number;
  roundNumber: number;
  gameStartTime: number;
}

// Zod schemas for validation
export const CardSchema = z.object({
  r: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
    z.literal(10),
    z.literal(11),
    z.literal(12),
    z.literal(13),
  ]),
  s: z.enum(['C', 'D', 'H', 'S']),
});

export const SideHandArrangementSchema = z.object({
  highBoard: z.tuple([CardSchema, CardSchema]),
  lowBoard: z.tuple([CardSchema, CardSchema]),
  unusedCard: CardSchema,
});

export const JoinRoomSchema = z.object({
  roomCode: z.string().trim().min(3).max(20),
  playerName: z.string().trim().min(1).max(24),
  playerId: z.string().max(100).optional(),
});

export const CreateRoomSchema = z.object({
  playerName: z.string().trim().min(1).max(24),
  ante: z.number().int().min(1).max(10000).optional(),
});

export const SetAnteSchema = z.object({
  ante: z.number().int().min(1).max(10000),
});

export const FlopDecisionSchema = z.object({
  decision: z.enum(['pot', 'fold']),
});

export const SubmitSideHandSchema = z.object({
  arrangement: SideHandArrangementSchema.optional(),
});

export const GameGetStateSchema = z.object({
  roomCode: z.string().optional(),
  playerId: z.string().optional(),
});

export const GameStateSchema = z.object({
  roomCode: z.string(),
  phase: z.enum(['lobby', 'pot_or_fold', 'side_game', 'settlement']),
  players: z.array(z.any()),
  buttonIdx: z.number(),
  turnIdx: z.number(),
  ante: z.number(),
  initialPot: z.number(),
  mainPot: z.number(),
  carryoverPot: z.number(),
  communityCards: z.array(CardSchema),
  deck: z.array(z.union([CardSchema, z.null()])),
  settlement: z.any().optional().nullable(),
  version: z.number(),
  roundNumber: z.number(),
  gameStartTime: z.number(),
});

export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
