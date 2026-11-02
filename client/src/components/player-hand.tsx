import { Card } from './card';
import type { Card as CardType, GameState } from '@shared/game-types';

interface PlayerHandProps {
  gameState: GameState;
  playerId: string;
}

export function PlayerHand({ gameState, playerId }: PlayerHandProps) {
  const currentPlayer = gameState.players.find((p) => p.id === playerId);
  if (!currentPlayer) return null;

  const validCards = currentPlayer.hand.filter((c): c is CardType => c !== null);

  return (
    <div className="flex items-center justify-center gap-2">
      {validCards.map((card, index) => (
        <Card key={`${card.r}-${card.s}-${index}`} card={card} size="lg" />
      ))}
    </div>
  );
}
