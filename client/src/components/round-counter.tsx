import { useState, useEffect } from "react";
import { LobbyIcon, TimerIcon } from "@/components/icons/Furious5Icons";

interface RoundCounterProps {
  roundNumber: number;
  gameStartTime: number;
  currentPlayer?: string;
  totalPlayers: number;
}

export function RoundCounter({ 
  roundNumber, 
  gameStartTime, 
  currentPlayer, 
  totalPlayers 
}: RoundCounterProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Update timer every second for live duration display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const elapsedSeconds = Math.max(0, Math.floor((currentTime - gameStartTime) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const formattedDuration =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-2 shadow-sm" data-testid="round-counter">
      <div className="flex items-center gap-2">
        <LobbyIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-foreground" data-testid="text-round-number">
          Round {roundNumber}
        </span>
      </div>
      
      <div className="h-4 w-px bg-border" />
      
      <div className="flex items-center gap-2">
        <TimerIcon className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm font-medium text-foreground tabular-nums" data-testid="text-game-duration">
          {formattedDuration}
        </span>
      </div>

      {currentPlayer && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-accent" />
            <span className="text-sm text-muted-foreground" data-testid="text-current-turn">
              {currentPlayer}'s turn
            </span>
          </div>
        </>
      )}
    </div>
  );
}
