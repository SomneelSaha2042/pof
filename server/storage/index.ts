import { MemStorage } from "./mem-storage";
import { RedisStorage } from "./redis-storage";
import type { IStorage, StorageStatus } from "./types";

const redisUrl = process.env.REDIS_URL;

export const storage: IStorage = redisUrl ? new RedisStorage(redisUrl) : new MemStorage();

export function getStorageStatus(): StorageStatus {
  if (storage instanceof RedisStorage) {
    return storage.getStatus();
  }

  return { redis: "disabled" };
}

export type { IStorage, StorageStatus };
