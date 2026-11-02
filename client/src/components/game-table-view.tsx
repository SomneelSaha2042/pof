import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from './card';
import { SideGamePanel } from './side-game-panel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  Card as CardType,
  GameState,
  SideHandArrangement,
} from '@shared/game-types';
import {
  cardsEqual,
  cardToString,
  computeBestSideArrangement,
  evaluateBestOmahaHand,
} from '@shared/game-engine';
import {
  Coins,
  Flame,
  Sparkles,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Crown,
  Trophy,
  ArrowRight,
} from 'lucide-react';

export type RunoutStage = 'flop' | 'pre_turn' | 'turn' | 'river' | 'complete';

interface GameTableViewProps {
  gameState: GameState;
  playerId: string;
  fourColor: boolean;
  visibleCommunityCount: number;
  runoutStage: RunoutStage;
  onDecision: (decision: 'pot' | 'fold') => void;
  onSubmitSideHand: (arrangement?: SideHandArrangement) => void;
  onOpenSettlement?: () => void;
}

// Well-spaced seat positions around the oval perimeter for 1..7 opponents
const OPPONENT_LAYOUTS: Record<number, string[]> = {
  1: ['top-5 left-1/2 -translate-x-1/2'],
  2: ['top-8 left-[20%] -translate-x-1/2', 'top-8 left-[80%] -translate-x-1/2'],
  3: [
    'top-1/2 -translate-y-1/2 left-5',
    'top-5 left-1/2 -translate-x-1/2',
    'top-1/2 -translate-y-1/2 right-5',
  ],
  4: [
    'bottom-24 left-6',
    'top-8 left-[24%] -translate-x-1/2',
    'top-8 left-[76%] -translate-x-1/2',
    'bottom-24 right-6',
  ],
  5: [
    'bottom-24 left-5',
    'top-14 left-10',
    'top-4 left-1/2 -translate-x-1/2',
    'top-14 right-10',
    'bottom-24 right-5',
  ],
  6: [
    'bottom-24 left-5',
    'top-1/2 -translate-y-1/2 left-4',
    'top-6 left-[28%] -translate-x-1/2',
    'top-6 left-[72%] -translate-x-1/2',
    'top-1/2 -translate-y-1/2 right-4',
    'bottom-24 right-5',
  ],
  7: [
    'bottom-20 left-5',
    'top-1/2 -translate-y-1/2 left-4',
    'top-7 left-[22%] -translate-x-1/2',
    'top-4 left-1/2 -translate-x-1/2',
    'top-7 left-[78%] -translate-x-1/2',
    'top-1/2 -translate-y-1/2 right-4',
    'bottom-20 right-5',
  ],
};

function PokerChipIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'h-5 w-5 rounded-full border-2 border-dashed border-white/90 bg-amber-500 shadow-sm flex items-center justify-center shrink-0',
        className
      )}
    >
      <div className="h-2.5 w-2.5 rounded-full bg-amber-300 border border-amber-700" />
    </div>
  );
}

export function GameTableView({
  gameState,
  playerId,
  fourColor,
  visibleCommunityCount,
  runoutStage,
  onDecision,
  onSubmitSideHand,
  onOpenSettlement,
}: GameTableViewProps) {
  const heroIndex = gameState.players.findIndex((p) => p.id === playerId);
  const heroPlayer =
    heroIndex !== -1 ? gameState.players[heroIndex] : gameState.players[0];
  const isMyTurn =
    gameState.phase === 'pot_or_fold' &&
    gameState.players[gameState.turnIdx]?.id === playerId &&
    heroPlayer?.decision === 'pending';

  const currentTurnPlayer = gameState.players[gameState.turnIdx];
  const buttonPlayer = gameState.players[gameState.buttonIdx];

  // Visible community cards based on staged Turn/River deal animation
  const visibleBoardCards = useMemo(
    () => gameState.communityCards.slice(0, visibleCommunityCount),
    [gameState.communityCards, visibleCommunityCount]
  );

  const isRunoutActive =
    gameState.phase !== 'pot_or_fold' && runoutStage !== 'complete';

  // Rotate opponents clockwise starting from the seat to Hero's left
  const opponents = useMemo(() => {
    if (heroIndex === -1) return gameState.players.slice(1);
    return [
      ...gameState.players.slice(heroIndex + 1),
      ...gameState.players.slice(0, heroIndex),
    ];
  }, [gameState.players, heroIndex]);

  const heroValidCards = useMemo(
    () => (heroPlayer?.hand ?? []).filter((c): c is CardType => c !== null),
    [heroPlayer?.hand]
  );

  // Live Omaha evaluation for Hero using currently visible board cards (3 on flop, 4 on turn, 5 on river)
  const heroOmahaEval = useMemo(() => {
    if (heroValidCards.length < 2 || visibleBoardCards.length < 3) return null;
    try {
      return evaluateBestOmahaHand(heroValidCards, visibleBoardCards);
    } catch {
      return null;
    }
  }, [heroValidCards, visibleBoardCards]);

  // Live optimal Side Game preview for Hero
  const heroSidePreview = useMemo(() => {
    if (heroValidCards.length !== 5) return null;
    try {
      return computeBestSideArrangement(heroValidCards);
    } catch {
      return null;
    }
  }, [heroValidCards]);

  const oppPositions =
    OPPONENT_LAYOUTS[Math.min(Math.max(opponents.length, 1), 7)];

  const isCardInHeroOmaha = (card: CardType) => {
    if (!heroOmahaEval) return false;
    return heroOmahaEval.holeCardsUsed.some((c) => cardsEqual(c, card));
  };

  const isBoardCardHighlighted = (card: CardType) => {
    // At river/complete showdown, highlight the winning hand's board cards if available
    if (
      (runoutStage === 'river' || runoutStage === 'complete') &&
      gameState.settlement?.mainPotResult.outcome === 'showdown'
    ) {
      const winnerId = gameState.settlement.mainPotResult.winnerIds[0];
      const winEval =
        winnerId && gameState.settlement.mainPotResult.playerEvaluations[winnerId];
      if (winEval) {
        return winEval.boardCardsUsed.some((c) => cardsEqual(c, card));
      }
    }
    if (!heroOmahaEval) return false;
    return heroOmahaEval.boardCardsUsed.some((c) => cardsEqual(c, card));
  };

  // Determine banner message during Turn & River runout
  const runoutBannerText = useMemo(() => {
    if (gameState.phase === 'pot_or_fold') return null;
    if (runoutStage === 'pre_turn') {
      return 'Showdown! Cards revealed — dealing Turn...';
    }
    if (runoutStage === 'turn') {
      return 'Turn dealt — dealing River...';
    }
    const mainRes = gameState.settlement?.mainPotResult;
    if (mainRes) {
      if (mainRes.outcome === 'rollover') {
        return `Everyone folded on the flop — Main Pot (${mainRes.potAmount}) rolls over!`;
      }
      if (mainRes.outcome === 'uncontested') {
        const w = gameState.players.find((p) => p.id === mainRes.winnerIds[0]);
        return `${w?.name ?? 'Player'} wins Main Pot (${mainRes.potAmount}) uncontested!`;
      }
      if (mainRes.outcome === 'showdown') {
        const winnerNames = mainRes.winnerIds
          .map((id) => gameState.players.find((p) => p.id === id)?.name)
          .filter(Boolean)
          .join(' & ');
        const firstWinEval = mainRes.playerEvaluations[mainRes.winnerIds[0]];
        return `${winnerNames} wins Main Pot (${mainRes.potAmount}) — ${firstWinEval?.label ?? ''}`;
      }
    }
    return null;
  }, [gameState.phase, gameState.settlement, gameState.players, runoutStage]);

  return (
    <div className="flex flex-col gap-6 w-full select-none">
      {/* Top Status Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0d141f]/90 px-5 py-3 text-white shadow-lg backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="uppercase tracking-widest text-white/70 font-bold">
              Hand #{gameState.roundNumber}
            </span>
          </div>
          <span className="text-white/20">|</span>
          <div>
            <span className="text-white/50">BUTTON: </span>
            <span className="font-bold text-amber-300">
              {buttonPlayer?.name ?? '—'}
            </span>
          </div>
          <span className="text-white/20">|</span>
          <div>
            <span className="text-white/50">ANTE: </span>
            <span className="font-bold text-emerald-400">{gameState.ante}</span>
          </div>
          {gameState.carryoverPot > 0 && (
            <>
              <span className="text-white/20">|</span>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/40 font-mono text-[11px]">
                Rollover: +{gameState.carryoverPot}
              </Badge>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {gameState.phase === 'pot_or_fold' ? (
            <div className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-1.5 border border-white/10">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-white/80">
                Turn:{' '}
                <strong
                  className="text-amber-300 font-bold"
                  data-testid="current-turn-player"
                >
                  {currentTurnPlayer?.id === playerId
                    ? 'YOUR ACTION'
                    : currentTurnPlayer?.name}
                </strong>
              </span>
            </div>
          ) : isRunoutActive ? (
            <div className="flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-1.5 border border-amber-400/40">
              <Sparkles className="h-4 w-4 text-amber-300 animate-spin" />
              <span className="text-xs font-bold text-amber-200 uppercase tracking-wider">
                Board Runout ({visibleCommunityCount}/5 Cards)
              </span>
            </div>
          ) : gameState.phase === 'side_game' ? (
            <div className="flex items-center gap-2 rounded-xl bg-purple-500/20 px-4 py-1.5 border border-purple-400/40">
              <Flame className="h-4 w-4 text-purple-300" />
              <span className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                Side Game — Arrange Two 2-Card Boards
              </span>
            </div>
          ) : (
            onOpenSettlement && (
              <Button
                size="sm"
                onClick={onOpenSettlement}
                data-testid="button-view-settlement"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl"
              >
                View Full Settlement
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            )
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* POKERNOW-STYLE OVAL STADIUM TABLE                                     */}
      {/* ===================================================================== */}
      <div className="relative mx-auto w-full max-w-[1220px] py-4 sm:py-8 px-2 sm:px-6">
        <div
          className="relative w-full min-h-[500px] sm:min-h-[560px] rounded-[150px] sm:rounded-[270px] border-[14px] sm:border-[18px] border-[#1b222c] bg-[radial-gradient(ellipse_at_center,#157347_0%,#0c4f30_62%,#07301d_100%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.75),0_30px_80px_-15px_rgba(0,0,0,0.9),0_0_0_2px_rgba(255,255,255,0.08)] flex flex-col items-center justify-center px-6 py-14"
          data-testid="poker-table-felt"
        >
          {/* Inner Rail & Betting Line */}
          <div className="pointer-events-none absolute inset-3 sm:inset-5 rounded-[136px] sm:rounded-[250px] border border-emerald-200/15" />
          <div className="pointer-events-none absolute inset-10 sm:inset-16 rounded-[110px] sm:rounded-[210px] border border-dashed border-white/10" />

          {/* Subtle Center Watermark */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-[0.05] select-none">
            <span className="font-display text-4xl sm:text-6xl font-black tracking-[0.25em] text-white">
              POT OR FOLD
            </span>
          </div>

          {/* ================================================================= */}
          {/* OPPONENT SEAT PODS AROUND PERIMETER                               */}
          {/* ================================================================= */}
          <AnimatePresence>
            {opponents.map((opp, idx) => {
              const posClass = oppPositions[idx % oppPositions.length];
              const isTurn =
                gameState.phase === 'pot_or_fold' &&
                currentTurnPlayer?.id === opp.id;
              const isButton = buttonPlayer?.id === opp.id;
              const oppValidCards = opp.hand.filter(
                (c): c is CardType => c !== null
              );
              // Reveal opponent cards during showdown runout if they potted, or at settlement
              const showOppFaceUp =
                oppValidCards.length === 5 &&
                ((gameState.phase !== 'pot_or_fold' && opp.decision === 'pot') ||
                  (gameState.phase === 'settlement' && runoutStage === 'complete'));

              // Live Omaha hand label for potting opponents during showdown runout
              const oppLiveOmaha =
                showOppFaceUp &&
                opp.decision === 'pot' &&
                visibleBoardCards.length >= 3
                  ? evaluateBestOmahaHand(oppValidCards, visibleBoardCards)
                  : null;

              const isMainWinner =
                (runoutStage === 'river' || runoutStage === 'complete') &&
                gameState.settlement?.mainPotResult.winnerIds.includes(opp.id);

              return (
                <motion.div
                  key={opp.id}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  className={cn(
                    'z-20 flex flex-col items-center',
                    posClass,
                    'absolute'
                  )}
                  data-testid={`seat-opponent-${opp.name}`}
                >
                  {/* Opponent Hole Cards */}
                  <div
                    className={cn(
                      'flex items-center justify-center mb-1.5',
                      showOppFaceUp ? 'gap-1' : '-space-x-2'
                    )}
                  >
                    {Array.from({ length: 5 }).map((_, cIdx) => {
                      const cardObj = opp.hand[cIdx] ?? null;
                      const usedInOmaha =
                        showOppFaceUp &&
                        cardObj &&
                        oppLiveOmaha?.holeCardsUsed.some((hc) =>
                          cardsEqual(hc, cardObj)
                        );
                      return (
                        <Card
                          key={cIdx}
                          card={cardObj}
                          faceDown={!showOppFaceUp || !cardObj}
                          fourColor={fourColor}
                          size={showOppFaceUp ? 'sm' : 'xs'}
                          highlighted={Boolean(usedInOmaha)}
                          dimmed={Boolean(showOppFaceUp && oppLiveOmaha && !usedInOmaha)}
                        />
                      );
                    })}
                  </div>

                  {/* Opponent Seat Pod */}
                  <div
                    className={cn(
                      'relative flex items-center gap-3 rounded-2xl bg-[#101824]/95 px-4 py-2.5 border shadow-xl backdrop-blur-md min-w-[170px] sm:min-w-[195px] transition-all',
                      isMainWinner
                        ? 'border-amber-400 ring-2 ring-amber-400 shadow-[0_0_28px_rgba(246,197,66,0.55)]'
                        : isTurn
                        ? 'border-amber-400 ring-2 ring-amber-400/60 shadow-[0_0_25px_rgba(246,197,66,0.45)]'
                        : opp.decision === 'pot'
                        ? 'border-emerald-400/60'
                        : opp.decision === 'fold'
                        ? 'border-purple-400/40 opacity-90'
                        : 'border-white/15'
                    )}
                  >
                    {isButton && (
                      <div
                        className="absolute -top-2.5 -left-2.5 h-6 w-6 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-slate-950 font-mono text-[11px] font-black flex items-center justify-center border-2 border-white shadow-md"
                        title="Dealer Button"
                      >
                        D
                      </div>
                    )}

                    <div
                      className={cn(
                        'h-9 w-9 rounded-full flex items-center justify-center font-display font-bold text-sm text-white shrink-0 border',
                        opp.decision === 'pot'
                          ? 'bg-emerald-600 border-emerald-300'
                          : opp.decision === 'fold'
                          ? 'bg-purple-900/80 border-purple-400/50'
                          : 'bg-slate-800 border-white/20'
                      )}
                    >
                      {opp.name[0]?.toUpperCase() || '?'}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-display text-sm font-bold text-white">
                          {opp.name}
                        </span>
                        {opp.isBot && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono uppercase text-white/70">
                            BOT
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            'font-mono text-xs font-bold',
                            opp.chipDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          )}
                        >
                          {opp.chipDelta >= 0 ? `+${opp.chipDelta}` : opp.chipDelta}
                        </span>
                        <span className="text-white/25">•</span>
                        {opp.decision === 'pending' && (
                          <span className="font-mono text-[10px] text-amber-300 uppercase">
                            {isTurn ? 'Acting...' : 'Waiting'}
                          </span>
                        )}
                        {opp.decision === 'pot' && (
                          <span className="font-mono text-[10px] font-extrabold text-emerald-400 uppercase">
                            POTTED ({opp.potContribution})
                          </span>
                        )}
                        {opp.decision === 'fold' && (
                          <span className="font-mono text-[10px] font-extrabold text-purple-300 uppercase">
                            SIDE GAME
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Live Showdown Hand Pill under Opponent Seat */}
                  {oppLiveOmaha && (
                    <div className="mt-1.5 rounded-full bg-black/75 border border-amber-400/40 px-3 py-0.5 text-[11px] font-mono font-bold text-amber-300 shadow-md">
                      {oppLiveOmaha.label}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* ================================================================= */}
          {/* CENTER BOARD: MAIN POT + 5 COMMUNITY CARDS                        */}
          {/* ================================================================= */}
          <div className="relative z-10 flex flex-col items-center justify-center my-auto py-8">
            {/* Main Pot Pill */}
            <motion.div
              key={gameState.mainPot}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="mb-5 flex items-center gap-3 rounded-full border border-amber-400/40 bg-[#0b131e]/90 px-6 py-2 shadow-[0_10px_25px_rgba(0,0,0,0.6)] backdrop-blur-md"
            >
              <PokerChipIcon />
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-white/65">
                  Main Pot
                </span>
                <span
                  className="font-mono text-2xl font-black text-amber-300"
                  data-testid="main-pot-amount"
                >
                  {gameState.mainPot}
                </span>
              </div>
              <div className="ml-2 border-l border-white/15 pl-3 text-xs font-mono text-emerald-300">
                To Pot: <strong>{gameState.initialPot}</strong>
              </div>
            </motion.div>

            {/* 5 Community Card Slots (Flop + Staged Turn & River) */}
            <div
              className="flex items-center justify-center gap-2.5 sm:gap-4 rounded-2xl border border-white/15 bg-black/25 px-5 py-4 sm:px-7 sm:py-5 shadow-inner"
              data-testid="community-cards-board"
            >
              {Array.from({ length: 5 }).map((_, slotIdx) => {
                const card = visibleBoardCards[slotIdx] ?? null;
                const slotLabel =
                  slotIdx < 3 ? 'FLOP' : slotIdx === 3 ? 'TURN' : 'RIVER';

                if (!card) {
                  return (
                    <div
                      key={`empty-${slotIdx}`}
                      className="h-[4.85rem] w-[3.45rem] sm:h-[6.1rem] sm:w-[4.35rem] rounded-xl border-2 border-dashed border-white/15 bg-white/[0.03] flex items-center justify-center text-white/25"
                    >
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                        {slotLabel}
                      </span>
                    </div>
                  );
                }

                return (
                  <motion.div
                    key={`${card.r}-${card.s}-${slotIdx}`}
                    initial={{ opacity: 0, y: -18, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.28, ease: 'easeOut' }}
                  >
                    <Card
                      card={card}
                      size="lg"
                      fourColor={fourColor}
                      highlighted={isBoardCardHighlighted(card)}
                    />
                  </motion.div>
                );
              })}
            </div>

            {/* Live Runout / Winner Banner on the Felt */}
            <AnimatePresence mode="wait">
              {runoutBannerText && (
                <motion.div
                  key={runoutBannerText}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-4 flex items-center gap-2 rounded-full border border-amber-400/50 bg-[#0b131e]/95 px-5 py-2 text-xs sm:text-sm font-display font-bold text-amber-300 shadow-xl"
                  data-testid="table-runout-banner"
                >
                  <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>{runoutBannerText}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SIDE GAME PANEL (WHEN PHASE === 'side_game' AND RUNOUT FINISHED)      */}
      {/* ===================================================================== */}
      {gameState.phase === 'side_game' && !isRunoutActive && (
        <SideGamePanel
          gameState={gameState}
          playerId={playerId}
          fourColor={fourColor}
          onSubmitSideHand={onSubmitSideHand}
        />
      )}

      {/* ===================================================================== */}
      {/* SPACIOUS 2-ROW HERO HAND & POKERNOW ACTION DOCK                       */}
      {/* ===================================================================== */}
      {heroPlayer && (
        <div
          className="mx-auto w-full max-w-[1220px] rounded-2xl border border-white/15 bg-[#0d1520]/95 p-5 sm:p-7 text-white shadow-2xl backdrop-blur-md space-y-5"
          data-testid="hero-player-dock"
        >
          {/* ROW 1: Hero Seat Identity + Spacious 5 Hole Cards + Action Buttons */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Hero Identity Pill */}
            <div className="relative flex items-center gap-3.5 rounded-2xl border border-white/15 bg-white/[0.04] px-5 py-3.5 min-w-[230px]">
              {buttonPlayer?.id === heroPlayer.id && (
                <div className="absolute -top-2.5 -left-2.5 h-7 w-7 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-slate-950 font-mono text-xs font-black flex items-center justify-center border-2 border-white shadow-md">
                  D
                </div>
              )}
              <div className="h-12 w-12 rounded-full bg-emerald-600 border-2 border-emerald-300 flex items-center justify-center font-display text-lg font-extrabold text-white shrink-0">
                {heroPlayer.name[0]?.toUpperCase() || 'Y'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-base text-white">
                    {heroPlayer.name}
                  </span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 font-mono text-[10px]">
                    YOU
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 font-mono text-xs">
                  <span className="text-white/55">
                    Stack:{' '}
                    <strong
                      className={
                        heroPlayer.chipDelta >= 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }
                    >
                      {heroPlayer.chipDelta >= 0
                        ? `+${heroPlayer.chipDelta}`
                        : heroPlayer.chipDelta}
                    </strong>
                  </span>
                  <span className="text-white/25">•</span>
                  <span className="text-amber-300">
                    In Pot: <strong>{heroPlayer.potContribution}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Hero's 5 Hole Cards — Centered & Generously Spaced */}
            <div
              className="flex items-center justify-center gap-3 sm:gap-4 py-1"
              data-testid="hero-hole-cards"
            >
              {heroValidCards.map((card, idx) => (
                <Card
                  key={`${card.r}-${card.s}-${idx}`}
                  card={card}
                  size="lg"
                  fourColor={fourColor}
                  showWildBadge
                  highlighted={isCardInHeroOmaha(card)}
                />
              ))}
            </div>

            {/* Right: PokerNow Action Buttons (POT or FOLD) */}
            <div className="flex items-center justify-center lg:justify-end w-full lg:w-auto min-w-[260px]">
              {gameState.phase === 'pot_or_fold' && isMyTurn ? (
                <div className="flex items-center gap-3.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => onDecision('fold')}
                    data-testid="button-action-fold"
                    className="flex-1 sm:flex-initial min-w-[140px] chunky-button rounded-xl bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 border border-rose-400/40 px-6 py-4 text-white shadow-lg transition-all flex flex-col items-center justify-center"
                  >
                    <span className="font-display text-base font-black tracking-wider uppercase">
                      FOLD
                    </span>
                    <span className="font-mono text-[11px] text-rose-100/90 mt-0.5">
                      To Side Game
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDecision('pot')}
                    data-testid="button-action-pot"
                    className="flex-1 sm:flex-initial min-w-[175px] chunky-button rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 border border-emerald-300/50 px-7 py-4 text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.45)] transition-all flex flex-col items-center justify-center"
                  >
                    <span className="font-display text-base font-black tracking-wider uppercase flex items-center gap-1.5">
                      <Coins className="h-4 w-4" />
                      POT ({gameState.initialPot})
                    </span>
                    <span className="font-mono text-[11px] font-bold text-slate-900/80 mt-0.5">
                      Match Initial Pot
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-xs sm:text-sm font-mono text-white/80">
                  {heroPlayer.decision === 'pot' ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span>
                        You <strong className="text-emerald-400">POTTED</strong> (+
                        {gameState.initialPot})
                      </span>
                    </>
                  ) : heroPlayer.decision === 'fold' ? (
                    <>
                      <Flame className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>
                        You <strong className="text-amber-300">FOLDED</strong> to
                        Side Game
                      </span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                      <span>
                        Waiting for <strong>{currentTurnPlayer?.name}</strong>...
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ROW 2: Spacious Full-Width Best Hand Readouts (No Truncation / No Cramping) */}
          {(heroOmahaEval || heroSidePreview) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10">
              {/* Best PLO5 Main Hand Box */}
              {heroOmahaEval && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                      <Sparkles className="h-3.5 w-3.5 shrink-0" />
                      Best PLO5 Hand (2 Hole + 3 Board)
                    </div>
                    <div
                      className="mt-1 font-display text-base sm:text-lg font-extrabold text-white"
                      data-testid="hero-omaha-readout"
                    >
                      {heroOmahaEval.label}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-xs bg-black/35 px-3 py-1.5 rounded-lg border border-white/10 shrink-0">
                    <span className="text-amber-300 font-bold">
                      {heroOmahaEval.holeCardsUsed.map(cardToString).join(' ')}
                    </span>
                    <span className="text-white/40">+</span>
                    <span className="text-emerald-300 font-bold">
                      {heroOmahaEval.boardCardsUsed.map(cardToString).join(' ')}
                    </span>
                  </div>
                </div>
              )}

              {/* Best Side Game Hand Box */}
              {heroSidePreview && (
                <div className="rounded-xl border border-purple-400/25 bg-purple-500/[0.07] px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-mono font-bold uppercase tracking-wider text-purple-300">
                      <Crown className="h-3.5 w-3.5 shrink-0" />
                      Optimal Side Game Hand (2 Boards)
                    </div>
                    <div
                      className="mt-1 font-display text-base sm:text-lg font-extrabold text-white"
                      data-testid="hero-side-readout"
                    >
                      {heroSidePreview.tierLabel}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs bg-black/35 px-3 py-1.5 rounded-lg border border-white/10 shrink-0">
                    <span className="text-emerald-300 font-bold">
                      {heroSidePreview.arrangement.highBoard
                        .map(cardToString)
                        .join(' ')}
                    </span>
                    <span className="text-white/40">/</span>
                    <span className="text-sky-300 font-bold">
                      {heroSidePreview.arrangement.lowBoard
                        .map(cardToString)
                        .join(' ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
