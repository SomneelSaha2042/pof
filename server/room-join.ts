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
  guestId?: string,
): JoinResult {
  if (guestId && gameState.players.some(player => player.guestId === guestId && player.name.toLowerCase() !== playerName.toLowerCase())) {
    throw new Error("This browser already has a seat at this table");
  }
  const existingPlayer = gameState.players.find((player) => player.name.toLowerCase() === playerName.toLowerCase());
  if (existingPlayer) {
    if (existingPlayer.isBot || existingPlayer.id !== reconnectToken || (existingPlayer.guestId && existingPlayer.guestId !== guestId)) {
      throw new Error("A player with that name is already in the room");
    }
    const players = gameState.players.map((player) =>
      player.id === existingPlayer.id
        ? {
            ...player,
            connected: true,
            guestId,
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
    state: joinGame(gameState, playerName, newPlayerId, undefined, guestId),
    playerId: newPlayerId,
    rejoined: false,
  };
}
