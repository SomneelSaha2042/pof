import { expireGameActions } from "@shared/game-engine";
import type { GameState } from "@shared/game-types";
import type { IStorage } from "./storage";

export async function expireRoomActions(rooms: IStorage, publish: (state: GameState) => void, now = Date.now()): Promise<void> {
  for (const roomCode of await rooms.listActiveRooms()) {
    const state = await rooms.getRoom(roomCode);
    if (!state || (state.phase !== "pot_or_fold" && state.phase !== "side_game")) continue;
    if (state.actionDeadline && state.actionDeadline > now) continue;
    const next = await rooms.mutateRoom(roomCode, current => expireGameActions(current, now));
    if (next.version !== state.version) publish(next);
  }
}
