import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import type { GameState } from '@shared/game-types';
import { LobbyView } from '@/components/lobby-view';
import { GameTableView, type RunoutStage } from '@/components/game-table-view';
import { SettlementView } from '@/components/settlement-view';
import { BrandMark } from '@/components/brand-mark';
import { useGameSocket } from '@/hooks/use-game-socket';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Hash,
  LogOut,
  RotateCw,
  Palette,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

export default function Game() {
  const [, setLocation] = useLocation();
  const [fourColor, setFourColor] = useState(true);
  const {
    gameState,
    playerId,
    roomCode,
    isSpectator,
    isConnected,
    spectateRoom,
    setAnte,
    addBot,
    removeBot,
    toggleReady,
    startGame,
    submitDecision,
    submitSideHand,
    startNewRound,
    requestGameState,
    clearRoom,
    staleSession,
    markSessionAsStale,
  } = useGameSocket();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spectateCode = params.get('spectate');
    if (spectateCode && (!roomCode || roomCode !== spectateCode.toUpperCase())) {
      spectateRoom(spectateCode.toUpperCase());
    }
  }, [roomCode, spectateRoom]);

  useEffect(() => {
    if (!roomCode && !playerId) {
      const timer = setTimeout(() => setLocation('/'), 1000);
      return () => clearTimeout(timer);
    }
  }, [roomCode, playerId, setLocation]);

  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!roomCode || !playerId) {
        setShouldRedirect(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [roomCode, playerId]);

  useEffect(() => {
    if (shouldRedirect) {
      setLocation('/');
    }
  }, [shouldRedirect, setLocation]);

  const [httpGameState, setHttpGameState] = useState<GameState | null>(null);

  useEffect(() => {
    if (!gameState && roomCode && playerId) {
      const fetchRoomState = async () => {
        try {
          const response = await fetch(
            `/api/rooms/${roomCode}?playerId=${playerId}`
          );
          const data = await response.json();

          if (data.success && data.gameState) {
            setHttpGameState(data.gameState);
          } else {
            if (response.status === 404 || data.error === 'Room not found') {
              markSessionAsStale();
            }
          }
        } catch (error) {
          console.error('Error fetching room state via HTTP:', error);
        }
      };
      const timer = setTimeout(fetchRoomState, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState, roomCode, playerId, markSessionAsStale]);

  const fallbackGameState = useMemo<GameState>(
    () => ({
      roomCode: roomCode || 'POF-TABLE',
      phase: 'lobby',
      players: [
        {
          id: playerId || 'player1',
          name: 'You',
          connected: true,
          ready: false,
          hand: [],
          chipDelta: 0,
          currentHandDelta: 0,
          potContribution: 0,
          decision: 'pending',
          sideArrangement: null,
          sideEvaluation: null,
          sideLocked: false,
        },
      ],
      buttonIdx: 0,
      turnIdx: 0,
      ante: 10,
      initialPot: 0,
      mainPot: 0,
      carryoverPot: 0,
      communityCards: [],
      deck: [],
      settlement: null,
      version: 0,
      roundNumber: 1,
      gameStartTime: Date.now(),
    }),
    [roomCode, playerId]
  );

  const effectiveGameState = gameState || httpGameState || fallbackGameState;

  // =========================================================================
  // STAGED TURN & RIVER RUNOUT ANIMATION STATE
  // =========================================================================
  const [visibleCommunityCount, setVisibleCommunityCount] = useState<number>(3);
  const [runoutStage, setRunoutStage] = useState<RunoutStage>('flop');
  const [inspectingTableInSettlement, setInspectingTableInSettlement] =
    useState(false);
  const animatedRoundRef = useRef<number | null>(null);

  useEffect(() => {
    const phase = effectiveGameState.phase;
    const round = effectiveGameState.roundNumber;
    const totalBoard = effectiveGameState.communityCards.length;

    if (phase === 'lobby' || phase === 'pot_or_fold') {
      setVisibleCommunityCount(3);
      setRunoutStage('flop');
      setInspectingTableInSettlement(false);
      animatedRoundRef.current = null;
      return;
    }

    // We are in 'side_game' or 'settlement'
    if (animatedRoundRef.current === round) {
      // Already ran (or running) the board runout animation for this hand
      return;
    }

    animatedRoundRef.current = round;

    if (totalBoard === 5) {
      // 2+ players potted! Slowly deal Turn, then River, then show results
      setVisibleCommunityCount(3);
      setRunoutStage('pre_turn');

      const turnTimer = setTimeout(() => {
        setVisibleCommunityCount(4);
        setRunoutStage('turn');
      }, 1200);

      const riverTimer = setTimeout(() => {
        setVisibleCommunityCount(5);
        setRunoutStage('river');
      }, 2500);

      const doneTimer = setTimeout(() => {
        setRunoutStage('complete');
      }, 4300);

      return () => {
        clearTimeout(turnTimer);
        clearTimeout(riverTimer);
        clearTimeout(doneTimer);
      };
    } else {
      // 0 or 1 player potted (no Turn/River runout)
      setVisibleCommunityCount(totalBoard);
      if (phase === 'settlement') {
        setRunoutStage('river');
        const doneTimer = setTimeout(() => {
          setRunoutStage('complete');
        }, 1200);
        return () => clearTimeout(doneTimer);
      } else {
        setRunoutStage('complete');
      }
    }
  }, [
    effectiveGameState.phase,
    effectiveGameState.roundNumber,
    effectiveGameState.communityCards.length,
  ]);

  if (!roomCode || !playerId) {
    return (
      <div className="bg-[#090d14] flex min-h-screen items-center justify-center px-4 text-white">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-400" />
          <p className="text-sm font-semibold text-amber-300/80">
            Connecting to Poker Table...
          </p>
        </div>
      </div>
    );
  }

  const isLobby = effectiveGameState.phase === 'lobby';
  // Keep showing the Poker Table while the Turn & River runout is animating
  const showSettlementView =
    effectiveGameState.phase === 'settlement' &&
    runoutStage === 'complete' &&
    !inspectingTableInSettlement;
  const showTableView = !isLobby && !showSettlementView;

  return (
    <div className="min-h-screen bg-[#080c12] bg-[radial-gradient(ellipse_at_top,#102235_0%,#080c12_70%)] text-foreground select-none flex flex-col">
      {/* Session Inactive Dialog */}
      <AlertDialog open={staleSession} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Session inactive</AlertDialogTitle>
            <AlertDialogDescription>
              This table session is no longer active. Return to the main lobby to
              start or join a new table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                clearRoom();
                setLocation('/');
              }}
            >
              Return Home
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Top PokerNow-Style Bar */}
      <header className="flex justify-between items-center w-full px-4 sm:px-6 py-3 z-50 border-b border-white/10 bg-[#0b111a]/95 backdrop-blur-md text-white shadow-md">
        <div className="flex items-center gap-3 sm:gap-4">
          <BrandMark
            className="h-10 w-10 p-1 rounded-lg shadow-sm"
            imageClassName="h-full w-full"
          />
          <div>
            <span className="font-display font-black text-sm sm:text-base tracking-tight text-white">
              POT OR FOLD
            </span>
            <span className="hidden sm:inline-block ml-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
              PLO5 + 2-Board Side Game
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full border border-white/15">
            <Hash className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono text-xs font-bold text-white">
              {roomCode}
            </span>
          </div>

          {isSpectator && (
            <div
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/15 rounded-full border border-amber-400/40"
              data-testid="spectator-mode-badge"
            >
              <Eye className="h-3.5 w-3.5 text-amber-300" />
              <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                Spectating
              </span>
            </div>
          )}

          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
              )}
            />
            <span
              className={cn(
                'font-mono text-[10px] font-extrabold uppercase',
                isConnected ? 'text-emerald-400' : 'text-rose-400'
              )}
            >
              {isConnected ? 'Live' : 'Reconnecting'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle between Table & Settlement when in settlement phase */}
          {effectiveGameState.phase === 'settlement' &&
            runoutStage === 'complete' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setInspectingTableInSettlement((prev) => !prev)
                }
                className="border-amber-400/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 text-xs font-mono rounded-xl"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                {inspectingTableInSettlement ? 'Show Settlement' : 'Inspect Table'}
              </Button>
            )}

          {/* 4-Color Deck Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFourColor((prev) => !prev)}
            data-testid="button-toggle-deck-colors"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white text-xs font-mono rounded-xl"
          >
            <Palette className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            {fourColor ? '4-Color Deck' : '2-Color Deck'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => requestGameState?.()}
            className="hidden sm:flex border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white text-xs rounded-xl"
            title="Sync Table State"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>

          <Button
            onClick={() => {
              clearRoom();
              setLocation('/');
            }}
            variant="destructive"
            size="sm"
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-3 sm:px-6 py-5">
        {effectiveGameState.actionDeadline && (
          <p role="status" className="mb-3 text-center text-sm text-amber-300">
            {effectiveGameState.phase === 'pot_or_fold' ? 'Automatic fold' : 'Automatic side-hand lock'} at{' '}
            {new Date(effectiveGameState.actionDeadline).toLocaleTimeString()}.
          </p>
        )}
        {isLobby && (
          <LobbyView
            gameState={effectiveGameState}
            playerId={playerId}
            onStartGame={startGame}
            onToggleReady={toggleReady}
            onSetAnte={setAnte}
            onAddBot={addBot}
            onRemoveBot={removeBot}
          />
        )}

        {showTableView && (
          <GameTableView
            gameState={effectiveGameState}
            playerId={playerId}
            fourColor={fourColor}
            visibleCommunityCount={visibleCommunityCount}
            runoutStage={runoutStage}
            onDecision={submitDecision}
            onSubmitSideHand={submitSideHand}
            onOpenSettlement={() => setInspectingTableInSettlement(false)}
          />
        )}

        {showSettlementView && (
          <SettlementView
            gameState={effectiveGameState}
            playerId={playerId}
            onToggleReady={toggleReady}
            fourColor={fourColor}
            isSpectator={isSpectator}
            onStartNewRound={startNewRound}
            onSetAnte={setAnte}
          />
        )}
      </main>
    </div>
  );
}
