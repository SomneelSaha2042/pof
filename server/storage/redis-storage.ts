import { randomUUID } from "crypto";
import { createClient, type RedisClientType } from "redis";
import { GameStateSchema, type GameState } from "@shared/game-types";
import type { IStorage, StorageStatus } from "./types";

const ACTIVE_ROOMS_KEY = "rooms:active";
const DEFAULT_ROOM_TTL_SECONDS = 14400;
const DEFAULT_LOCK_TTL_MS = 5000;
const DEFAULT_LOCK_TIMEOUT_MS = 2000;
const LOCK_RETRY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RedisStorage implements IStorage {
  private redis: RedisClientType;
  private connectPromise: Promise<RedisClientType>;
  private ttlSeconds = Number(process.env.ROOM_TTL_SECONDS ?? DEFAULT_ROOM_TTL_SECONDS);
  private lockTtlMs = Number(process.env.REDIS_LOCK_TTL_MS ?? DEFAULT_LOCK_TTL_MS);
  private lockTimeoutMs = Number(process.env.REDIS_LOCK_TIMEOUT_MS ?? DEFAULT_LOCK_TIMEOUT_MS);
  private status: StorageStatus["redis"] = "connecting";
  private lastError?: string;

  constructor(redisUrl: string) {
    this.redis = createClient({ url: redisUrl });

    this.redis.on("ready", () => {
      this.status = "connected";
      this.lastError = undefined;
    });

    this.redis.on("end", () => {
      this.status = "disconnected";
    });

    this.redis.on("error", (error) => {
      this.status = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
      console.error("Redis error:", error);
    });

    this.connectPromise = this.redis
      .connect()
      .then(() => {
        this.status = "connected";
        return this.redis;
      })
      .catch((error) => {
        this.status = "error";
        this.lastError = error instanceof Error ? error.message : String(error);
        throw error;
      });
    void this.connectPromise.catch(() => undefined);
  }

  getStatus(): StorageStatus {
    return {
      redis: this.status,
      lastRedisError: this.lastError,
    };
  }

  async createRoom(gameState: GameState): Promise<string> {
    const redis = await this.getClient();
    const roomCode = gameState.roomCode;

    await redis.set(this.roomKey(roomCode), JSON.stringify(gameState), {
      EX: this.ttlSeconds,
    });
    await redis.sAdd(ACTIVE_ROOMS_KEY, roomCode);
    return roomCode;
  }

  async getRoom(roomCode: string): Promise<GameState | undefined> {
    const redis = await this.getClient();
    const key = this.roomKey(roomCode);
    const json = await redis.get(key);

    if (!json) {
      await redis.sRem(ACTIVE_ROOMS_KEY, roomCode);
      return undefined;
    }

    const parsed = JSON.parse(json);
    if (process.env.NODE_ENV !== "production") {
      return GameStateSchema.parse(parsed);
    }
    return parsed as GameState;
  }

  async updateRoom(roomCode: string, gameState: GameState): Promise<void> {
    const redis = await this.getClient();

    await redis.set(this.roomKey(roomCode), JSON.stringify(gameState), {
      EX: this.ttlSeconds,
    });
    await redis.sAdd(ACTIVE_ROOMS_KEY, roomCode);
  }

  async deleteRoom(roomCode: string): Promise<void> {
    const redis = await this.getClient();

    await redis.del(this.roomKey(roomCode));
    await redis.sRem(ACTIVE_ROOMS_KEY, roomCode);
  }

  async listActiveRooms(): Promise<string[]> {
    const redis = await this.getClient();
    const rooms = await redis.sMembers(ACTIVE_ROOMS_KEY);
    if (rooms.length === 0) return [];

    const pipeline = redis.multi();
    for (const roomCode of rooms) {
      pipeline.exists(this.roomKey(roomCode));
    }
    const results = (await pipeline.exec()) as unknown as number[];

    const stale: string[] = [];
    const active: string[] = [];
    rooms.forEach((roomCode, i) => {
      if (results[i]) {
        active.push(roomCode);
      } else {
        stale.push(roomCode);
      }
    });

    if (stale.length > 0) {
      redis.sRem(ACTIVE_ROOMS_KEY, stale).catch(() => undefined);
    }

    return active;
  }

  async mutateRoom(
    roomCode: string,
    mutator: (state: GameState) => GameState | Promise<GameState>,
  ): Promise<GameState> {
    const token = await this.acquireLock(roomCode);

    try {
      const current = await this.getRoom(roomCode);
      if (!current) {
        throw new Error("Room not found");
      }

      const next = await mutator(current);
      await this.updateRoom(roomCode, next);
      return next;
    } finally {
      await this.releaseLock(roomCode, token);
    }
  }

  private roomKey(roomCode: string): string {
    return `room:${roomCode}`;
  }

  private lockKey(roomCode: string): string {
    return `roomlock:${roomCode}`;
  }

  private async getClient(): Promise<RedisClientType> {
    if (this.redis.isReady) {
      return this.redis;
    }

    this.status = "connecting";
    return this.connectPromise;
  }

  private async acquireLock(roomCode: string): Promise<string> {
    const redis = await this.getClient();
    const token = randomUUID();
    const deadline = Date.now() + this.lockTimeoutMs;
    const key = this.lockKey(roomCode);

    while (Date.now() < deadline) {
      const result = await redis.set(key, token, {
        NX: true,
        PX: this.lockTtlMs,
      });

      if (result === "OK") {
        return token;
      }

      await sleep(LOCK_RETRY_MS);
    }

    throw new Error(`Timed out waiting for room lock: ${roomCode}`);
  }

  private async releaseLock(roomCode: string, token: string): Promise<void> {
    const redis = await this.getClient();

    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      {
        keys: [this.lockKey(roomCode)],
        arguments: [token],
      },
    );
  }
}
