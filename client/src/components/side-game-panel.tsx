import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card } from './card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  Card as CardType,
  GameState,
  SideHandArrangement,
} from '@shared/game-types';
import {
  computeBestSideArrangement,
  evaluateSideArrangement,
} from '@shared/game-engine';
import { Sparkles, Lock, CheckCircle2, ArrowLeftRight, Crown, Flame } from 'lucide-react';

interface SideGamePanelProps {
  gameState: GameState;
  playerId: string;
  fourColor: boolean;
  onSubmitSideHand: (arrangement: SideHandArrangement) => void;
}

type SlotKey =
  | { zone: 'high'; index: 0 | 1 }
  | { zone: 'low'; index: 0 | 1 }
  | { zone: 'unused'; index: 0 };

function sameSlot(a: SlotKey | null, b: SlotKey): boolean {
  if (!a) return false;
  return a.zone === b.zone && a.index === b.index;
}

export function SideGamePanel({
  gameState,
  playerId,
  fourColor,
  onSubmitSideHand,
}: SideGamePanelProps) {
  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const foldPlayers = gameState.players.filter((p) => p.decision === 'fold');
  const validHand = useMemo(
    () => (currentPlayer?.hand ?? []).filter((c): c is CardType => c !== null),
    [currentPlayer?.hand]
  );

  // Ordered array of 5 cards: [high0, high1, low0, low1, unused]
  const [slots, setSlots] = useState<CardType[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<SlotKey | null>(null);

  useEffect(() => {
    if (validHand.length === 5) {
      const initial =
        currentPlayer?.sideArrangement ??
        computeBestSideArrangement(validHand).arrangement;
      setSlots([
        initial.highBoard[0],
        initial.highBoard[1],
        initial.lowBoard[0],
        initial.lowBoard[1],
        initial.unusedCard,
      ]);
      setSelectedSlot(null);
    }
  }, [validHand, currentPlayer?.sideArrangement]);

  const liveEval = useMemo(() => {
    if (slots.length !== 5) return null;
    return evaluateSideArrangement({
      highBoard: [slots[0], slots[1]],
      lowBoard: [slots[2], slots[3]],
      unusedCard: slots[4],
    });
  }, [slots]);

  const slotIndexFromKey = (key: SlotKey): number => {
    if (key.zone === 'high') return key.index;
    if (key.zone === 'low') return 2 + key.index;
    return 4;
  };

  const handleCardClick = (targetKey: SlotKey) => {
    if (currentPlayer?.sideLocked) return;

    if (!selectedSlot) {
      setSelectedSlot(targetKey);
      return;
    }

    if (sameSlot(selectedSlot, targetKey)) {
      setSelectedSlot(null);
      return;
    }

    const idxA = slotIndexFromKey(selectedSlot);
    const idxB = slotIndexFromKey(targetKey);
    const next = [...slots];
    [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
    setSlots(next);
    setSelectedSlot(null);
  };

  const handleAutoBest = () => {
    if (validHand.length !== 5 || currentPlayer?.sideLocked) return;
    const best = computeBestSideArrangement(validHand).arrangement;
    setSlots([
      best.highBoard[0],
      best.highBoard[1],
      best.lowBoard[0],
      best.lowBoard[1],
      best.unusedCard,
    ]);
    setSelectedSlot(null);
  };

  const handleLockIn = () => {
    if (!liveEval || currentPlayer?.sideLocked) return;
    onSubmitSideHand(liveEval.arrangement);
  };

  if (!currentPlayer || currentPlayer.decision !== 'fold') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-400/30 bg-[#0d1520]/95 p-5 text-white shadow-2xl backdrop-blur-md"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-400">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Side Game in Progress ({foldPlayers.filter((p) => p.sideLocked).length}/
                {foldPlayers.length} Locked In)
              </h3>
              <p className="text-xs text-white/65">
                You potted the Main Pot! Waiting for folding players to lock in their two 2-card boards.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {foldPlayers.map((fp) => (
              <Badge
                key={fp.id}
                className={cn(
                  'font-mono text-xs px-3 py-1',
                  fp.sideLocked
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                )}
              >
                {fp.name}: {fp.sideLocked ? 'Locked' : 'Arranging...'}
              </Badge>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  const tierBadgeColors = {
    quads: 'bg-gradient-to-r from-purple-600 to-amber-500 text-white border-amber-300',
    king_kong: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 border-yellow-300',
    popo: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 border-emerald-300',
    normal: 'bg-slate-800 text-emerald-300 border-emerald-500/40',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-4xl rounded-2xl border border-emerald-400/30 bg-[#0b131e]/95 p-5 sm:p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-md"
      data-testid="side-game-panel"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-400" />
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
              Side Game — Build Two 2-Card Boards
            </h2>
          </div>
          <p className="text-xs text-white/65 mt-0.5">
            Click any two cards to swap slots, or use <span className="text-emerald-400 font-semibold">Auto-Best</span>. Rank <span className="text-amber-300 font-semibold">3 is a Wild Joker</span>!
          </p>
        </div>

        {liveEval && (
          <div
            className={cn(
              'px-3.5 py-1.5 rounded-xl border font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider shadow-lg self-start sm:self-auto',
              tierBadgeColors[liveEval.tier]
            )}
            data-testid="side-hand-tier-badge"
          >
            {liveEval.tierLabel}
          </div>
        )}
      </div>

      {/* 3 Zones: High Board, Low Board, Unused */}
      {slots.length === 5 && liveEval && (
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          {/* Board 1 */}
          <div className="rounded-xl border border-emerald-400/25 bg-emerald-950/25 p-4 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between mb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-300 font-bold">
                Board A (2 Cards)
              </span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-400/30 font-mono text-[11px]">
                { evaluateSideArrangement({
                  highBoard: [slots[0], slots[1]],
                  lowBoard: [slots[2], slots[3]],
                  unusedCard: slots[4],
                }).highEval.cards[0] === slots[0]
                  ? liveEval.highEval.label
                  : liveEval.lowEval.label }
              </Badge>
            </div>
            <div className="flex items-center justify-center gap-3 py-1">
              {([0, 1] as const).map((idx) => {
                const key: SlotKey = { zone: 'high', index: idx };
                return (
                  <Card
                    key={`high-${idx}`}
                    card={slots[idx]}
                    size="lg"
                    fourColor={fourColor}
                    showWildBadge
                    selected={sameSlot(selectedSlot, key)}
                    onClick={() => handleCardClick(key)}
                  />
                );
              })}
            </div>
          </div>

          {/* Board 2 */}
          <div className="rounded-xl border border-sky-400/25 bg-sky-950/25 p-4 flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between mb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-sky-300 font-bold">
                Board B (2 Cards)
              </span>
              <Badge className="bg-sky-500/20 text-sky-300 border-sky-400/30 font-mono text-[11px]">
                { evaluateSideArrangement({
                  highBoard: [slots[0], slots[1]],
                  lowBoard: [slots[2], slots[3]],
                  unusedCard: slots[4],
                }).highEval.cards[0] === slots[0]
                  ? liveEval.lowEval.label
                  : liveEval.highEval.label }
              </Badge>
            </div>
            <div className="flex items-center justify-center gap-3 py-1">
              {([0, 1] as const).map((idx) => {
                const key: SlotKey = { zone: 'low', index: idx };
                return (
                  <Card
                    key={`low-${idx + 2}`}
                    card={slots[2 + idx]}
                    size="lg"
                    fourColor={fourColor}
                    showWildBadge
                    selected={sameSlot(selectedSlot, key)}
                    onClick={() => handleCardClick(key)}
                  />
                );
              })}
            </div>
          </div>

          {/* Unused 5th card */}
          <div className="rounded-xl border border-white/15 bg-white/5 p-4 flex flex-col items-center justify-between min-w-[140px]">
            <div className="w-full text-center mb-3">
              <span className="font-mono text-[11px] uppercase tracking-wider text-white/50 font-bold">
                Unused (1 Card)
              </span>
            </div>
            <div className="flex items-center justify-center py-1">
              <Card
                card={slots[4]}
                size="lg"
                fourColor={fourColor}
                showWildBadge
                dimmed={!sameSlot(selectedSlot, { zone: 'unused', index: 0 })}
                selected={sameSlot(selectedSlot, { zone: 'unused', index: 0 })}
                onClick={() => handleCardClick({ zone: 'unused', index: 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <ArrowLeftRight className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            Hierarchy: <strong className="text-white">Quads (7x)</strong> &gt;{' '}
            <strong className="text-white">King Kong 10-J-Q-K (5x)</strong> &gt;{' '}
            <strong className="text-white">Popo (4x)</strong> &gt;{' '}
            <strong className="text-white">Pair &gt; 82 &gt; Baccarat 9..0 (2x)</strong>
          </span>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {!currentPlayer.sideLocked ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleAutoBest}
                data-testid="button-auto-best-side"
                className="border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 hover:text-amber-200 font-bold"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                Auto-Best
              </Button>
              <Button
                type="button"
                onClick={handleLockIn}
                data-testid="button-lock-side-hand"
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold px-6 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
              >
                <Lock className="h-4 w-4 mr-1.5" />
                Lock In Side Hand
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-mono text-xs font-bold">
              <CheckCircle2 className="h-4 w-4" />
              Side Hand Locked! Waiting for others (
              {foldPlayers.filter((p) => p.sideLocked).length}/{foldPlayers.length})
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
