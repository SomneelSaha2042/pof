import { useState, useEffect, useCallback } from 'react';
import type { GameState, SideHandArrangement } from '@shared/game-types';
import { gameSocket } from '@/lib/socket';
import { useToast } from '@/hooks/use-toast';

interface UseGameSocketReturn {
  gameState: GameState | null;
  playerId: string | null;
  roomCode: string | null;
  isSpectator: boolean;
  isConnected: boolean;
  connectionState: string;
  staleSession: boolean;
  createRoom: (playerName: string, ante?: number) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  spectateRoom: (roomCode: string) => void;
  setAnte: (ante: number) => void;
  addBot: () => void;
  removeBot: (botId: string) => void;
  toggleReady: () => void;
  startGame: () => void;
  submitDecision: (decision: 'pot' | 'fold') => void;
  submitSideHand: (arrangement?: SideHandArrangement) => void;
  startNewRound: () => void;
  requestGameState: () => void;
  clearRoom: () => void;
  markSessionAsStale: () => void;
}

export function useGameSocket(): UseGameSocketReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() =>
    localStorage.getItem('furious-five-player-id')
  );
  const [roomCode, setRoomCode] = useState<string | null>(() =>
    localStorage.getItem('furious-five-room-code')
  );
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [staleSession, setStaleSession] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (playerId) {
      localStorage.setItem('furious-five-player-id', playerId);
    } else {
      localStorage.removeItem('furious-five-player-id');
    }
  }, [playerId]);

  useEffect(() => {
    if (roomCode) {
      localStorage.setItem('furious-five-room-code', roomCode);
    } else {
      localStorage.removeItem('furious-five-room-code');
    }
  }, [roomCode]);

  useEffect(() => {
    gameSocket.setLastSession(roomCode, playerId);
  }, [roomCode, playerId]);

  useEffect(() => {
    gameSocket.on('room:created', (data) => {
      setRoomCode(data.roomCode);
      setPlayerId(data.playerId);
      setStaleSession(false);
      toast({
        title: 'Table Created',
        description: `Room code: ${data.roomCode}`,
        duration: 4000,
      });
    });

    gameSocket.on('room:joined', (data) => {
      setRoomCode(data.roomCode);
      setPlayerId(data.playerId);
      setStaleSession(false);
      toast({
        title: 'Joined Table',
        description: `Connected to ${data.roomCode}`,
      });
    });

    gameSocket.on('room:spectating', (data) => {
      setRoomCode(data.roomCode);
      setPlayerId(data.playerId);
      setStaleSession(false);
      toast({
        title: 'Spectating Table',
        description: `Watching ${data.roomCode} live`,
      });
    });

    gameSocket.on('state:update', (data: GameState, message: any) => {
      setGameState(data);
      setStaleSession(false);
      if (message && message.notification) {
        toast({
          description: message.notification.message,
          duration: 2800,
        });
      }
    });

    gameSocket.on('notification', (data) => {
      toast({
        description: data.message,
        duration: 2800,
      });
    });

    gameSocket.on('error', (data) => {
      toast({
        title: 'Action Error',
        description: data.message,
        variant: 'destructive',
      });

      const code = typeof data === 'object' ? data.code : undefined;
      if (code === 'ROOM_NOT_FOUND' || code === 'NOT_IN_ROOM') {
        setStaleSession(true);
      }
    });

    gameSocket.on('connection:lost', () => {
      toast({
        title: 'Connection Lost',
        description: 'Reconnecting to table...',
        duration: 3000,
      });
    });

    gameSocket.on('connection:restored', (data) => {
      toast({
        title: 'Reconnected',
        description: 'Back at the table',
        duration: 2500,
      });

      if (data.roomCode && data.playerId) {
        gameSocket.send('game:getState', {
          roomCode: data.roomCode,
          playerId: data.playerId,
        });
      }
    });

    gameSocket.on('connection:failed', () => {
      toast({
        title: 'Connection Failed',
        description: 'Unable to reconnect. Please refresh the page.',
        variant: 'destructive',
        duration: 8000,
      });
    });

    setIsConnected(gameSocket.isConnected());
    setConnectionState(gameSocket.getConnectionState());

    gameSocket.on('connection:change', (state) => {
      setIsConnected(state === 'connected');
      setConnectionState(state);
    });

    return () => {
      gameSocket.off('room:created');
      gameSocket.off('room:joined');
      gameSocket.off('room:spectating');
      gameSocket.off('state:update');
      gameSocket.off('notification');
      gameSocket.off('error');
      gameSocket.off('connection:lost');
      gameSocket.off('connection:restored');
      gameSocket.off('connection:failed');
      gameSocket.off('connection:change');
    };
  }, [toast]);

  const createRoom = useCallback(
    (playerName: string, ante = 10) => {
      if (!gameSocket.isConnected()) {
        toast({
          title: 'Connection Error',
          description: 'Not connected to server. Please refresh the page.',
          variant: 'destructive',
        });
        return;
      }
      gameSocket.send('room:create', { playerName, ante });
    },
    [toast]
  );

  const joinRoom = useCallback((code: string, playerName: string) => {
    gameSocket.send('room:join', { roomCode: code, playerName, playerId: code === roomCode ? playerId ?? undefined : undefined });
  }, [roomCode, playerId]);

  const spectateRoom = useCallback((code: string) => {
    gameSocket.send('room:spectate', { roomCode: code.trim().toUpperCase() });
  }, []);

  const setAnte = useCallback((ante: number) => {
    gameSocket.send('room:setAnte', { ante });
  }, []);

  const addBot = useCallback(() => {
    gameSocket.send('room:addBot', {});
  }, []);

  const removeBot = useCallback((botId: string) => {
    gameSocket.send('room:removeBot', { botId });
  }, []);

  const toggleReady = useCallback(() => {
    gameSocket.send('player:ready');
  }, []);

  const startGame = useCallback(() => {
    gameSocket.send('game:start');
  }, []);

  const submitDecision = useCallback((decision: 'pot' | 'fold') => {
    gameSocket.send('turn:decision', { decision });
  }, []);

  const submitSideHand = useCallback((arrangement?: SideHandArrangement) => {
    gameSocket.send('side:submit', { arrangement });
  }, []);

  const startNewRound = useCallback(() => {
    gameSocket.send('round:new');
  }, []);

  const requestGameState = useCallback(() => {
    if (roomCode && playerId) {
      gameSocket.send('game:getState', { roomCode, playerId });
    }
  }, [roomCode, playerId]);

  const clearRoom = useCallback(() => {
    localStorage.removeItem('furious-five-room-code');
    localStorage.removeItem('furious-five-player-id');
    setRoomCode(null);
    setPlayerId(null);
    setGameState(null);
    setStaleSession(false);
  }, []);

  const markSessionAsStale = useCallback(() => {
    setStaleSession(true);
  }, []);

  const isSpectator = Boolean(
    playerId?.startsWith('spectator_') ||
      (gameState &&
        playerId &&
        !gameState.players.some((p) => p.id === playerId))
  );

  return {
    gameState,
    playerId,
    roomCode,
    isSpectator,
    isConnected,
    connectionState,
    staleSession,
    createRoom,
    joinRoom,
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
    markSessionAsStale,
  };
}
