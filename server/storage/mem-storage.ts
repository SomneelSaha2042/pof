import type { GameState } from "@shared/game-types";
import type { IStorage } from "./types";

export class MemStorage implements IStorage {
  private rooms: Map<string, GameState>;
  private lastActivity: Map<string, number>;
  private roomQueues = new Map<string, Promise<void>>();

  constructor() {
    this.rooms = new Map();
    this.lastActivity = new Map();

    setInterval(() => {
      this.cleanupInactiveRooms();
    }, 30 * 60 * 1000);
  }

  async createRoom(gameState: GameState): Promise<string> {
    this.rooms.set(gameState.roomCode, gameState);
    this.lastActivity.set(gameState.roomCode, Date.now());
    return gameState.roomCode;
  }

  async getRoom(roomCode: string): Promise<GameState | undefined> {
    const room = this.rooms.get(roomCode);
    if (room) {
      this.lastActivity.set(roomCode, Date.now());
    }
    return room;
  }

  async updateRoom(roomCode: string, gameState: GameState): Promise<void> {
    if (!this.rooms.has(roomCode)) {
      throw new Error("Room not found");
    }
    this.rooms.set(roomCode, gameState);
    this.lastActivity.set(roomCode, Date.now());
  }

  async deleteRoom(roomCode: string): Promise<void> {
    this.rooms.delete(roomCode);
    this.lastActivity.delete(roomCode);
  }

  async listActiveRooms(): Promise<string[]> {
    return Array.from(this.rooms.keys());
  }

  async mutateRoom(
    roomCode: string,
    mutator: (state: GameState) => GameState | Promise<GameState>,
  ): Promise<GameState> {
    return this.withRoomQueue(roomCode, async () => {
      const current = await this.getRoom(roomCode);
      if (!current) {
        throw new Error("Room not found");
      }

      const next = await mutator(current);
      await this.updateRoom(roomCode, next);
      return next;
    });
  }

  private async withRoomQueue<T>(roomCode: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.roomQueues.get(roomCode) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    const queue = run.then(
      () => undefined,
      () => undefined,
    );

    this.roomQueues.set(roomCode, queue);

    try {
      return await run;
    } finally {
      if (this.roomQueues.get(roomCode) === queue) {
        this.roomQueues.delete(roomCode);
      }
    }
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    const maxInactiveTime = 2 * 60 * 60 * 1000;

    for (const [roomCode, lastActive] of Array.from(this.lastActivity)) {
      if (now - lastActive > maxInactiveTime) {
        this.rooms.delete(roomCode);
        this.lastActivity.delete(roomCode);
        console.log(`Cleaned up inactive room: ${roomCode}`);
      }
    }
  }
}
