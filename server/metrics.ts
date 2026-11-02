import { getStorageStatus } from "./storage";

class Metrics {
  private activeSockets = 0;
  private messagesReceived = 0;
  private messagesSent = 0;
  private roomsCreated = 0;

  setActiveSockets(count: number): void {
    this.activeSockets = count;
  }

  incrementMessagesReceived(): void {
    this.messagesReceived += 1;
  }

  incrementMessagesSent(): void {
    this.messagesSent += 1;
  }

  incrementRoomsCreated(): void {
    this.roomsCreated += 1;
  }

  async snapshot(activeRooms: number): Promise<Record<string, unknown>> {
    const memory = process.memoryUsage();
    const storageStatus = getStorageStatus();

    return {
      redis: storageStatus.redis,
      lastRedisError: storageStatus.lastRedisError,
      activeRooms,
      activeSockets: this.activeSockets,
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      roomsCreated: this.roomsCreated,
      uptime: process.uptime(),
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    };
  }
}

export const metrics = new Metrics();
