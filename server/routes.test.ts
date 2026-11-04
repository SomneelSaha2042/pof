import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { registerRoutes } from "./routes";
import { MemStorage } from "./storage/mem-storage";
import { createGame, addBotPlayer, togglePlayerReady, startRound } from "../shared/game-engine";

test("HTTP viewers cannot use a public bot ID to see private cards", async t => {
  const rooms = new MemStorage();
  const state = startRound(togglePlayerReady(addBotPlayer(createGame("POF-BOT", "Alice", "alice")), "alice"));
  await rooms.createRoom(state);
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app, rooms);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/rooms/POF-BOT`;
  const botId = state.players.find(p => p.isBot)!.id;
  for (const query of ["", `?playerId=${botId}`, "?playerId=seat_0", "?playerId=alice&playerId=wrong"]) {
    const result = await fetch(url + query).then(r => r.json());
    assert.ok(result.gameState.players.every((p: any) => p.hand.every((c: any) => c === null)));
  }
  const own = await fetch(url + "?playerId=alice").then(r => r.json());
  assert.ok(own.gameState.players[0].hand.every((c: any) => c !== null));
});
