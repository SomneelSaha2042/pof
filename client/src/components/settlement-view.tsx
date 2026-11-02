import { motion } from 'framer-motion';
import { Card } from './card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Card as CardType, GameState } from '@shared/game-types';
import { cardsEqual } from '@shared/game-engine';
import {
  Trophy,
  Crown,
  Swords,
  Play,
  Coins,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface SettlementViewProps {
  gameState: GameState;
  fourColor?: boolean;
  onStartNewRound: () => void;
  onSetAnte?: (ante: number) => void;
}

const ANTE_PRESETS = [5, 10, 20, 25, 50, 100];

export function SettlementView({
  gameState,
  fourColor = true,
  onStartNewRound,
  onSetAnte,
}: SettlementViewProps) {
  const settlement = gameState.settlement;
  if (!settlement) return null;

  const { mainPotResult, sideMatchups, mainPotDeltas, sideGameDeltas, totalRoundDeltas } =
    settlement;

  const potPlayers = gameState.players.filter((p) => p.decision === 'pot');
  const foldPlayers = gameState.players.filter((p) => p.decision === 'fold');

  const formatDelta = (val: number) => (val > 0 ? `+${val}` : `${val}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-6xl space-y-6 text-white select-none"
      data-testid="settlement-view"
    >
      {/* Top Banner & Deal Next Hand CTA */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 rounded-2xl border border-emerald-400/30 bg-[#0d1622]/95 p-6 shadow-2xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-mono text-xs uppercase tracking-widest font-bold">
            <Sparkles className="h-4 w-4" />
            Hand #{gameState.roundNumber} Complete
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">
            Showdown & Side Game Settlement
          </h1>
          <p className="text-xs sm:text-sm text-white/65 mt-0.5">
            Button moves clockwise for Hand #{gameState.roundNumber + 1}.
            {gameState.carryoverPot > 0 && (
              <span className="ml-2 text-amber-300 font-semibold">
                • Main Pot of {gameState.carryoverPot} rolls over to the next hand!
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {onSetAnte && (
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase text-white/50 mr-1">
                Next Ante:
              </span>
              {ANTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSetAnte(preset)}
                  className={cn(
                    'px-2 py-0.5 rounded-md font-mono text-xs font-bold transition-colors',
                    gameState.ante === preset
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-white/70 hover:bg-white/10'
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
          )}

          <Button
            onClick={onStartNewRound}
            data-testid="button-next-hand"
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black px-6 py-6 rounded-xl shadow-[0_0_25px_rgba(16,185,129,0.45)] text-base"
          >
            <Play className="h-5 w-5 mr-2 fill-current" />
            Deal Next Hand
          </Button>
        </div>
      </div>

      {/* Main Grid: Main Pot Section + Side Game Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ================================================================= */}
        {/* 1. MAIN POT SHOWDOWN CARD                                         */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-white/15 bg-[#0d1520]/95 p-6 shadow-xl flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Trophy className="h-5 w-5 text-amber-400" />
                <h2 className="font-display text-lg font-bold text-white">
                  Main Pot ({mainPotResult.potAmount} Chips)
                </h2>
              </div>
              <Badge
                className={cn(
                  'font-mono text-xs uppercase',
                  mainPotResult.outcome === 'rollover'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                )}
              >
                {mainPotResult.outcome === 'showdown'
                  ? 'PLO5 Showdown'
                  : mainPotResult.outcome === 'uncontested'
                  ? 'Uncontested Pot'
                  : 'All Folded — Rollover'}
              </Badge>
            </div>

            {/* Community Cards Board */}
            <div className="mt-4 rounded-xl border border-white/10 bg-[#0c4a2e]/50 p-4 flex flex-col items-center">
              <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-200/70 mb-2.5">
                Community Board ({gameState.communityCards.length} Cards)
              </span>
              <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                {gameState.communityCards.map((c, idx) => (
                  <Card key={idx} card={c} size="md" fourColor={fourColor} />
                ))}
              </div>
            </div>

            {/* Potting Players & Their Best 5-Card Omaha Hands */}
            <div className="mt-4 space-y-3">
              {potPlayers.length === 0 ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-4 text-center">
                  <RotateCcw className="h-6 w-6 text-amber-400 mx-auto mb-1.5" />
                  <p className="font-display text-sm font-bold text-amber-200">
                    Every player folded on the flop!
                  </p>
                  <p className="text-xs text-white/65 mt-0.5">
                    The {mainPotResult.potAmount} chip pot stays in the center for the next hand.
                  </p>
                </div>
              ) : (
                potPlayers.map((player) => {
                  const isWinner = mainPotResult.winnerIds.includes(player.id);
                  const omahaEval = mainPotResult.playerEvaluations[player.id];
                  const validCards = player.hand.filter((c): c is CardType => c !== null);

                  return (
                    <div
                      key={player.id}
                      className={cn(
                        'rounded-xl border p-4 transition-all',
                        isWinner
                          ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(246,197,66,0.15)]'
                          : 'border-white/10 bg-white/5'
                      )}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-white">
                            {player.name}
                          </span>
                          {isWinner && (
                            <Badge className="bg-amber-400 text-slate-950 font-mono text-[10px] font-black">
                              WINNER (+{mainPotResult.payoutPerWinner})
                            </Badge>
                          )}
                        </div>
                        {omahaEval ? (
                          <span className="font-mono text-xs font-bold text-emerald-300">
                            {omahaEval.label}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-emerald-300">
                            Won Uncontested
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {validCards.length > 0 ? (
                          validCards.map((c, cIdx) => {
                            const usedInOmaha = omahaEval?.holeCardsUsed.some((hc) =>
                              cardsEqual(hc, c)
                            );
                            return (
                              <Card
                                key={cIdx}
                                card={c}
                                size="sm"
                                fourColor={fourColor}
                                highlighted={Boolean(usedInOmaha)}
                                dimmed={Boolean(omahaEval && !usedInOmaha)}
                              />
                            );
                          })
                        ) : (
                          Array.from({ length: 5 }).map((_, cIdx) => (
                            <Card key={cIdx} faceDown size="sm" fourColor={fourColor} />
                          ))
                        )}
                        {omahaEval ? (
                          <span className="ml-auto font-mono text-[10px] text-white/50 max-w-[130px] text-right">
                            Highlighted 2 cards used with 3 board cards
                          </span>
                        ) : (
                          <span className="ml-auto font-mono text-[10px] text-white/45">
                            Uncontested (Mucked)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. SIDE GAME 1V1 RESULTS & ARRANGED BOARDS                        */}
        {/* ================================================================= */}
        <div className="rounded-2xl border border-white/15 bg-[#0d1520]/95 p-6 shadow-xl flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <Crown className="h-5 w-5 text-purple-400" />
                <h2 className="font-display text-lg font-bold text-white">
                  Side Game (1v1 2-Board Matchups)
                </h2>
              </div>
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-400/40 font-mono text-xs">
                {foldPlayers.length} Folder{foldPlayers.length === 1 ? '' : 's'}
              </Badge>
            </div>

            {foldPlayers.length < 2 ? (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-center text-white/60">
                <Swords className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="font-display text-sm font-bold text-white">
                  No 1v1 Side Game This Hand
                </p>
                <p className="text-xs mt-1">
                  At least 2 players must fold on the flop to trigger 1v1 side game matchups.
                </p>
              </div>
            ) : (
              <>
                {/* Each Folding Player's Arranged High & Low Boards */}
                <div className="mt-4 space-y-3">
                  {foldPlayers.map((fp) => {
                    const ev = fp.sideEvaluation;
                    if (!ev) return null;

                    return (
                      <div
                        key={fp.id}
                        className="rounded-xl border border-white/10 bg-white/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-sm text-white">
                              {fp.name}
                            </span>
                            <Badge className="bg-purple-500/20 text-purple-200 border-purple-400/30 font-mono text-[10px]">
                              {ev.tierLabel}
                            </Badge>
                          </div>
                          <div className="text-[11px] font-mono text-white/55 mt-1">
                            High: <strong className="text-emerald-300">{ev.highEval.label}</strong> • Low:{' '}
                            <strong className="text-sky-300">{ev.lowEval.label}</strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* High Board */}
                          <div className="flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-400/30 p-1">
                            <Card
                              card={ev.arrangement.highBoard[0]}
                              size="xs"
                              fourColor={fourColor}
                              showWildBadge
                            />
                            <Card
                              card={ev.arrangement.highBoard[1]}
                              size="xs"
                              fourColor={fourColor}
                              showWildBadge
                            />
                          </div>
                          {/* Low Board */}
                          <div className="flex items-center gap-1 rounded-lg bg-sky-500/10 border border-sky-400/30 p-1">
                            <Card
                              card={ev.arrangement.lowBoard[0]}
                              size="xs"
                              fourColor={fourColor}
                              showWildBadge
                            />
                            <Card
                              card={ev.arrangement.lowBoard[1]}
                              size="xs"
                              fourColor={fourColor}
                              showWildBadge
                            />
                          </div>
                          {/* Unused */}
                          <div className="opacity-45">
                            <Card
                              card={ev.arrangement.unusedCard}
                              size="xs"
                              fourColor={fourColor}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 1v1 Head-to-Head Matchup Breakdown */}
                <div className="mt-4 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-white/50 font-bold">
                    Head-to-Head 1v1 Results (Ante = {settlement.ante})
                  </div>
                  {sideMatchups.map((m, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Swords className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                        <span className="font-bold text-white">
                          {m.playerAName} vs {m.playerBName}
                        </span>
                      </div>
                      <span className="text-white/65 text-[11px]">{m.reason}</span>
                      {m.winnerId ? (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/40 font-mono text-[11px] shrink-0">
                          {m.winnerId === m.playerAId ? m.playerAName : m.playerBName} +{m.chipAmount} ({m.multiplier}x)
                        </Badge>
                      ) : (
                        <Badge className="bg-white/10 text-white/70 border-white/20 font-mono text-[11px] shrink-0">
                          PUSH (0)
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. COMBINED HAND CHIP LEDGER                                          */}
      {/* ===================================================================== */}
      <div className="rounded-2xl border border-white/15 bg-[#0d1520]/95 p-6 shadow-xl">
        <div className="flex items-center gap-2.5 mb-4">
          <Coins className="h-5 w-5 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">
            Hand #{gameState.roundNumber} Chip Settlement Ledger
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-white/50">
                <th className="py-2.5 px-3">Player</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3 text-right">Main Pot Net</th>
                <th className="py-2.5 px-3 text-right">Side Game Net</th>
                <th className="py-2.5 px-3 text-right">Hand Net</th>
                <th className="py-2.5 px-3 text-right">Session Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {gameState.players.map((p) => {
                const mainNet = mainPotDeltas[p.id] ?? 0;
                const sideNet = sideGameDeltas[p.id] ?? 0;
                const handNet = totalRoundDeltas[p.id] ?? 0;

                return (
                  <tr key={p.id} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-3 font-sans font-bold text-white">
                      {p.name}
                    </td>
                    <td className="py-3 px-3">
                      <Badge
                        className={cn(
                          'text-[10px] uppercase',
                          p.decision === 'pot'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                            : 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                        )}
                      >
                        {p.decision === 'pot' ? 'POTTED' : 'FOLD → SIDE'}
                      </Badge>
                    </td>
                    <td
                      className={cn(
                        'py-3 px-3 text-right font-bold',
                        mainNet > 0
                          ? 'text-emerald-400'
                          : mainNet < 0
                          ? 'text-rose-400'
                          : 'text-white/50'
                      )}
                    >
                      {formatDelta(mainNet)}
                    </td>
                    <td
                      className={cn(
                        'py-3 px-3 text-right font-bold',
                        sideNet > 0
                          ? 'text-emerald-400'
                          : sideNet < 0
                          ? 'text-rose-400'
                          : 'text-white/50'
                      )}
                    >
                      {formatDelta(sideNet)}
                    </td>
                    <td
                      className={cn(
                        'py-3 px-3 text-right font-extrabold',
                        handNet > 0
                          ? 'text-emerald-400'
                          : handNet < 0
                          ? 'text-rose-400'
                          : 'text-white/60'
                      )}
                    >
                      {formatDelta(handNet)}
                    </td>
                    <td
                      className={cn(
                        'py-3 px-3 text-right font-extrabold',
                        p.chipDelta > 0
                          ? 'text-amber-300'
                          : p.chipDelta < 0
                          ? 'text-rose-400'
                          : 'text-white/60'
                      )}
                    >
                      {formatDelta(p.chipDelta)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}
