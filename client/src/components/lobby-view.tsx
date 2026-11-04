import { useState } from 'react';
import type { GameState } from '@shared/game-types';
import { isTableHost } from '@shared/game-engine';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Hourglass,
  Users,
  CheckCircle2,
  XCircle,
  Check,
  UserPlus,
  Layers,
  Hash,
  Copy,
  PlayCircle,
  Star,
  Search,
  Coins,
  Bot,
  Trash2,
} from 'lucide-react';

interface LobbyViewProps {
  gameState: GameState;
  playerId: string;
  onStartGame: () => void;
  onToggleReady: () => void;
  onSetAnte: (ante: number) => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
}

const ANTE_PRESETS = [5, 10, 20, 25, 50, 100];

export function LobbyView({
  gameState,
  playerId,
  onStartGame,
  onToggleReady,
  onSetAnte,
  onAddBot,
  onRemoveBot,
}: LobbyViewProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [customAnte, setCustomAnte] = useState(gameState.ante.toString());

  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  const isSpectator = !currentPlayer;
  const isHost = isTableHost(gameState, playerId);
  const participants = gameState.players.filter(p => !p.sittingOut && p.connected);
  const allReady =
    participants.length >= 2 && participants.every((p) => p.ready);
  const readyCount = gameState.players.filter((p) => p.ready).length;
  const canStart = isHost && allReady;

  const readyDescriptor =
    readyCount < gameState.players.length
      ? `Waiting for players to ready up... (${readyCount}/${gameState.players.length})`
      : gameState.players.length < 2
      ? 'Need at least 2 players (invite a friend or add a bot)'
      : 'All players ready! Table can start.';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    toast({
      title: 'Room code copied!',
      description: 'Share this code with friends to join your POF table.',
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCustomAnteApply = () => {
    const val = parseInt(customAnte, 10);
    if (!Number.isNaN(val) && val >= 1 && val <= 10000) {
      onSetAnte(val);
    }
  };

  return (
    <motion.div
      className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center pt-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <div className="glass-card rounded-2xl shadow-2xl p-6 sm:p-8 border border-white/20 w-full text-foreground">
        {/* Lobby Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-primary mb-1">
              Pot or Fold Lobby
            </h1>
            <p className="font-sans text-sm text-muted-foreground flex items-center gap-2">
              <Hourglass className="h-4 w-4 animate-pulse text-victory-gold" />
              {readyDescriptor}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-muted px-4 py-2 rounded-xl flex items-center gap-2 border border-border">
              <Users className="h-4 w-4 text-secondary-foreground" />
              <span className="font-mono text-xs font-bold text-secondary-foreground uppercase">
                {gameState.players.length}/8 SEATS
              </span>
            </div>
            {!isSpectator && gameState.players.length < 8 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddBot}
                disabled={!isHost}
                data-testid="button-add-bot"
                className="border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 font-mono text-xs font-bold rounded-xl"
              >
                <Bot className="h-4 w-4 mr-1.5" />+ Add Bot
              </Button>
            )}
          </div>
        </div>

        {/* Table Ante Configuration */}
        <div className="mb-8 rounded-2xl border border-amber-400/25 bg-amber-500/5 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-300 font-mono text-xs uppercase tracking-widest font-bold">
                <Coins className="h-4 w-4" />
                Table Ante Configuration
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Every player posts <strong className="text-white">{gameState.ante}</strong> before the flop. Initial Pot for {Math.max(gameState.players.length, 2)} players:{' '}
                <strong className="text-emerald-400">
                  {Math.max(gameState.players.length, 2) * gameState.ante}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ANTE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={!isHost}
                  onClick={() => {
                    setCustomAnte(preset.toString());
                    onSetAnte(preset);
                  }}
                  data-testid={`button-ante-${preset}`}
                  className={cn(
                    'px-3 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all',
                    gameState.ante === preset
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                      : 'bg-card text-foreground border-border hover:border-amber-400/50'
                  )}
                >
                  {preset}
                </button>
              ))}
              <div className="flex items-center gap-1.5 ml-1">
                <Input
                  type="number"
                  disabled={!isHost}
                  min={1}
                  max={10000}
                  value={customAnte}
                  onChange={(e) => setCustomAnte(e.target.value)}
                  className="w-20 h-8 font-mono text-xs bg-card border-border"
                  data-testid="input-custom-ante"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleCustomAnteApply}
                  disabled={!isHost}
                  className="h-8 px-2.5 font-mono text-xs font-bold"
                >
                  Set
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Current Seats List */}
        <div className="mb-8">
          <h2 className="font-mono text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
            SEATED PLAYERS
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence>
              {gameState.players.map((player, index) => {
                const isSelf = player.id === playerId;
                const isReady = player.ready;
                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'flex items-center justify-between p-3.5 rounded-2xl bg-card border border-border shadow-sm transition-all',
                      isSelf && 'border-2 border-primary ring-1 ring-primary/20 bg-surface-cream'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-10 h-10 rounded-full bg-primary flex items-center justify-center text-slate-950 font-display text-base font-black shrink-0">
                        {player.name[0]?.toUpperCase() || '?'}
                        {index === 0 && (
                          <span
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-amber-400 text-slate-950 font-mono text-[9px] font-black flex items-center justify-center border border-slate-900"
                            title="Button on Hand #1"
                          >
                            D
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-display font-semibold text-sm text-foreground truncate">
                            {player.name}
                          </span>
                          {isSelf && (
                            <span className="font-mono text-[10px] text-emerald-400 font-bold">
                              (YOU)
                            </span>
                          )}
                          {player.isBot && (
                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/70">
                              BOT
                            </span>
                          )}
                        </div>
                        <div
                          className={cn(
                            'flex items-center gap-1 text-[11px] font-semibold',
                            player.connected ? 'text-action-emerald' : 'text-loss-crimson'
                          )}
                        >
                          {player.connected ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-action-emerald" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-loss-crimson" />
                          )}
                          <span>{player.connected ? 'Seated' : 'Offline'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'px-3 py-1 rounded-full font-mono text-[11px] font-bold flex items-center gap-1.5 border',
                          isReady
                            ? 'bg-action-emerald text-emerald-950 border-action-emerald'
                            : 'bg-muted text-muted-foreground border-border'
                        )}
                      >
                        {isReady && <Check className="h-3 w-3" />}
                        {isReady ? 'Ready' : 'Not Ready'}
                      </div>
                      {player.isBot && isHost && (
                        <button
                          type="button"
                          onClick={() => onRemoveBot(player.id)}
                          className="p-1.5 rounded-lg text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Remove Bot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {gameState.players.length < 2 && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-dashed border-border">
                  <div className="flex items-center gap-3 opacity-60">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                      <UserPlus className="h-4 w-4" />
                    </div>
                    <span className="font-display text-xs font-semibold italic text-muted-foreground">
                      Waiting for player or click "+ Add Bot"...
                    </span>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Room Code Copy Card */}
        <div className="bg-surface-cream border border-primary/15 rounded-2xl p-5 text-center mb-8 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 opacity-5 text-primary">
            <Layers className="h-[110px] w-[110px]" />
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <div className="flex items-center gap-2 text-action-emerald">
                <Hash className="h-5 w-5 text-victory-gold" />
                <span
                  className="font-display text-2xl font-bold tracking-widest text-primary"
                  data-testid="lobby-room-code"
                >
                  {gameState.roomCode}
                </span>
              </div>
              <p className="font-sans text-xs text-muted-foreground mt-1">
                Share this room code with friends to join this table.
              </p>
            </div>
            <button
              onClick={handleCopyCode}
              className={cn(
                'w-full sm:w-auto px-6 py-2.5 rounded-xl font-display text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 border-2',
                copied
                  ? 'bg-action-emerald/10 border-action-emerald text-action-emerald'
                  : 'bg-card border-border hover:border-victory-gold text-foreground'
              )}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Room Code'}
            </button>
          </div>
        </div>

        {/* Ready Up & Start Game CTAs */}
        {!isSpectator ? (
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <button
              onClick={onToggleReady}
              data-testid="button-toggle-ready"
              className={cn(
                'chunky-button py-4 rounded-xl font-display font-bold flex items-center justify-center gap-3 transition-all',
                currentPlayer?.ready
                  ? 'bg-loss-crimson hover:brightness-110 text-rose-950 shadow-[0_4px_0_0_rgba(190,18,60,0.4)]'
                  : 'bg-action-emerald hover:brightness-110 text-emerald-950 shadow-[0_4px_0_0_rgba(16,185,129,0.4)]'
              )}
            >
              {currentPlayer?.ready ? (
                <XCircle className="h-5 w-5" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              {currentPlayer?.ready ? 'Not Ready' : 'Ready Up'}
            </button>

            <button
              onClick={onStartGame}
              disabled={!canStart}
              data-testid="button-start-game"
              className={cn(
                'py-4 rounded-xl font-display font-bold flex items-center justify-center gap-3 transition-all',
                canStart
                  ? 'chunky-button bg-amber-400 hover:brightness-110 text-slate-950 shadow-[0_4px_0_0_rgba(180,83,9,0.5)]'
                  : 'bg-muted text-muted-foreground cursor-not-allowed opacity-80 border border-border'
              )}
            >
              {canStart ? (
                <PlayCircle className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5 animate-pulse" />
              )}
              {canStart
                ? 'Deal First Hand'
                : gameState.players.length < 2
                ? 'Need 2+ Players'
                : 'Waiting for Ready'}
            </button>
          </div>
        ) : (
          <div
            className="mb-8 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 text-center"
            data-testid="spectator-lobby-banner"
          >
            <div className="font-display text-sm font-bold text-amber-300">
              Spectating Lobby — Waiting for seated players to start the table
            </div>
          </div>
        )}

        {/* Rules Reference */}
        <div className="bg-muted rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-3 text-victory-gold">
            <Star className="h-4 w-4 fill-current" />
            <h3 className="font-display text-sm font-semibold text-primary">
              Pot or Fold (POF) Rules Summary
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 font-sans text-xs text-muted-foreground">
            <div className="space-y-2">
              <p className="font-bold text-white/90 uppercase font-mono text-[11px]">
                1. Main Game (PLO5 Pot or Fold)
              </p>
              <p>• Everyone posts the Ante and receives 5 hole cards.</p>
              <p>• Flop (3 cards) is dealt. Starting from the Button, each player chooses to <strong>POT</strong> (match the initial pot) or <strong>FOLD</strong>.</p>
              <p>• Players who Pot run out Turn & River and make the best 5-card poker hand using <strong>2 hole cards + 3 community cards</strong>.</p>
            </div>
            <div className="space-y-2">
              <p className="font-bold text-white/90 uppercase font-mono text-[11px]">
                2. Side Game (Folders 1v1 2-Board)
              </p>
              <p>• Folding players arrange 4 of their 5 cards into two 2-card hands (Rank <strong>3 is a Wild Joker</strong>).</p>
              <p>• 2-card hierarchy: <strong>Pair (AA..22) &gt; 82 &gt; Baccarat (9..0)</strong>.</p>
              <p>• Special hands auto-win: <strong>Quads (7x) &gt; King Kong 10-J-Q-K (5x) &gt; Popo Two Pairs (4x) &gt; Normal win both boards (2x)</strong>.</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
