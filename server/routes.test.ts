import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import WebSocket from "ws";
import { registerRoutes } from "./routes";
import { MemStorage } from "./storage/mem-storage";
import { createGame, addBotPlayer, togglePlayerReady, startRound } from "../shared/game-engine";

async function table(t: TestContext) {
  const rooms = new MemStorage();
  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app, rooms);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const clients: WebSocket[] = [];
  t.after(async () => {
    clients.forEach(client => client.terminate());
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const base = `127.0.0.1:${(server.address() as any).port}`;
  return { rooms, http: `http://${base}`, async connect(origin?: string) {
    const ws = new WebSocket(`ws://${base}/ws`, origin ? { origin } : undefined);
    clients.push(ws);
    await once(ws, "open");
    return ws;
  } };
}

function request(ws: WebSocket, type: string, data: any, expected: string, matches: (data: any) => boolean = () => true): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off("message", onMessage); reject(new Error(`Timed out waiting for ${type}`)); }, 3000);
    function onMessage(raw: WebSocket.RawData) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === expected && matches(msg.data)) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(msg.data);
      }
    }
    ws.on("message", onMessage);
    ws.send(JSON.stringify({ type, data }));
  });
}

test("network handlers reject seat theft, non-host stakes, and stale consent", async t => {
  const env = await table(t);
  const owner = await env.connect();
  const created = await request(owner, "room:create", { playerName: "Alice" }, "room:created");
  const guest = await env.connect();
  const stolen = await request(guest, "room:join", { roomCode: created.roomCode, playerName: "Alice" }, "error");
  assert.equal(stolen.code, "PLAYER_ALREADY_EXISTS");
  const httpTheft = await fetch(`${env.http}/api/rooms/${created.roomCode}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomCode: created.roomCode, playerName: "Alice" }) });
  assert.equal(httpTheft.status, 400);
  const joined = await request(guest, "room:join", { roomCode: created.roomCode, playerName: "Bob" }, "room:joined");
  assert.notEqual(joined.playerId, created.playerId);
  assert.equal((await request(guest, "room:setAnte", { ante: 10000 }, "error")).code, "SET_ANTE_FAILED");
  assert.equal((await request(guest, "game:start", { roundNumber: 1 }, "error")).code, "START_FAILED");
  await request(owner, "player:ready", { roundNumber: 1, ante: 10 }, "state:update", state => state.players.find((p: any) => p.id === created.playerId)?.ready);
  await request(owner, "room:setAnte", { ante: 20 }, "state:update", state => state.ante === 20);
  assert.equal((await request(guest, "player:ready", { roundNumber: 1, ante: 10 }, "error")).code, "READY_FAILED");
  const saved = (await env.rooms.getRoom(created.roomCode))!;
  assert.ok(saved.players.every(p => !p.ready));
  assert.equal((await request(owner, "game:start", { roundNumber: 1 }, "error")).code, "START_FAILED");
});

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
