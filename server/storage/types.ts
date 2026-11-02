import type { GameState } from "@shared/game-types";

export interface IStorage {
  createRoom(gameState: GameState): Promise<string>;
  getRoom(roomCode: string): Promise<GameState | undefined>;
  updateRoom(roomCode: string, gameState: GameState): Promise<void>;
  deleteRoom(roomCode: string): Promise<void>;
  listActiveRooms(): Promise<string[]>;
  mutateRoom(
    roomCode: string,
    mutator: (state: GameState) => GameState | Promise<GameState>,
  ): Promise<GameState>;
}

export interface StorageStatus {
  redis: "disabled" | "connected" | "connecting" | "disconnected" | "error";
  lastRedisError?: string;
}
