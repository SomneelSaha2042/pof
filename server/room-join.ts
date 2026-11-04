import type { GameState } from "@shared/game-types";
import { joinGame } from "@shared/game-engine";

interface JoinResult {
  state: GameState;
  playerId: string;
  rejoined: boolean;
}

export function joinOrReconnectPlayer(
  gameState: GameState,
  playerName: string,
  newPlayerId: string,
  reconnectToken?: string,
): JoinResult {
  const existingPlayer = gameState.players.find((player) => player.name.toLowerCase() === playerName.toLowerCase());
  if (existingPlayer) {
    if (existingPlayer.isBot || existingPlayer.id !== reconnectToken) {
      throw new Error("A player with that name is already in the room");
    }
    const players = gameState.players.map((player) =>
      player.id === existingPlayer.id
        ? {
            ...player,
            connected: true,
          }
        : player,
    );

    return {
      state: {
        ...gameState,
        players,
        version: gameState.version + 1,
      },
      playerId: existingPlayer.id,
      rejoined: true,
    };
  }

  return {
    state: joinGame(gameState, playerName, newPlayerId),
    playerId: newPlayerId,
    rejoined: false,
  };
}
