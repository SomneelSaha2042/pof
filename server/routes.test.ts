import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import WebSocket from "ws";
import { registerRoutes } from "./routes";
import { MemStorage } from "./storage/mem-storage";
import { createGame, addBotPlayer, togglePlayerReady, startRound } from "../shared/game-engine";

test("production starts without SESSION_SECRET and keeps its signing key across server restarts", async t => {
  const previousMode = process.env.NODE_ENV;
  const previousSecret = process.env.SESSION_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.SESSION_SECRET;
  t.after(() => {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = previousSecret;
  });
  const rooms = new MemStorage();
  let cookie: string | undefined;
  for (let restart = 0; restart < 2; restart++) {
    const app = express();
    const server = await registerRoutes(app, rooms);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/session`, { headers: cookie ? { Cookie: cookie } : {} });
      assert.equal(response.status, 204);
      const issued = response.headers.get("set-cookie");
      if (cookie) assert.equal(issued, null, "Restart must continue accepting the existing signed cookie");
      else {
        assert.match(issued!, /HttpOnly/);
        assert.match(issued!, /Secure/);
        cookie = issued!.split(";")[0];
      }
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }
});

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
  const session = async () => (await fetch(`http://${base}/api/session`)).headers.get("set-cookie")!.split(";")[0];
  return { rooms, http: `http://${base}`, session, async connect(origin?: string, cookie?: string) {
    cookie ??= await session();
    const ws = new WebSocket(`ws://${base}/ws`, { origin, headers: { Cookie: cookie } });
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

test("one browser cannot acquire a second seat through another socket or HTTP", async t => {
  const env = await table(t);
  const cookie = await env.session();
  const owner = await env.connect(undefined, cookie);
  const created = await request(owner, "room:create", { playerName: "Alice" }, "room:created");
  const secondTab = await env.connect(undefined, cookie);
  const secondSeat = await request(secondTab, "room:join", { roomCode: created.roomCode, playerName: "Other name" }, "error");
  assert.match(secondSeat.message, /already has a seat/);
  const httpSeat = await fetch(`${env.http}/api/rooms/${created.roomCode}/join`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ roomCode: created.roomCode, playerName: "Another name" }) });
  assert.equal(httpSeat.status, 400);
  assert.equal((await env.rooms.getRoom(created.roomCode))!.players.length, 1);
  await request(secondTab, "game:getState", created, "state:update", state => state.players.some((p: any) => p.id === created.playerId));
  const saved = (await env.rooms.getRoom(created.roomCode))!;
  assert.ok(saved.players[0].guestId);
  const view = await fetch(`${env.http}/api/rooms/${created.roomCode}?playerId=${created.playerId}`, { headers: { Cookie: cookie } }).then(r => r.json());
  assert.equal(view.gameState.players[0].guestId, undefined);
  const outsider = await env.connect();
  assert.equal((await request(outsider, "game:getState", created, "error")).code, "SESSION_MISMATCH");
});

test("only the owning browser sees its cards and active hands reject network redeals", async t => {
  const env = await table(t);
  const cookie = await env.session();
  const owner = await env.connect(undefined, cookie);
  const created = await request(owner, "room:create", { playerName: "Alice" }, "room:created");
  const guest = await env.connect();
  const joined = await request(guest, "room:join", { roomCode: created.roomCode, playerName: "Bob" }, "room:joined");
  await request(owner, "player:ready", { roundNumber: 1, ante: 10 }, "state:update", s => s.players.find((p: any) => p.id === created.playerId)?.ready);
  await request(guest, "player:ready", { roundNumber: 1, ante: 10 }, "state:update", s => s.players.every((p: any) => p.ready));
  await request(owner, "game:start", { roundNumber: 1 }, "state:update", s => s.phase === "pot_or_fold");
  await request(owner, "turn:decision", { decision: "pot" }, "state:update", s => s.mainPot === 40);
  const before = structuredClone(await env.rooms.getRoom(created.roomCode));
  assert.equal((await request(owner, "round:new", { roundNumber: 1 }, "error")).code, "NEW_ROUND_FAILED");
  assert.equal((await request(owner, "game:start", { roundNumber: 1 }, "error")).code, "START_FAILED");
  assert.deepEqual(await env.rooms.getRoom(created.roomCode), before);
  const path = `${env.http}/api/rooms/${created.roomCode}?playerId=${created.playerId}`;
  const own = await fetch(path, { headers: { Cookie: cookie } }).then(r => r.json());
  assert.ok(own.gameState.players[0].hand.every((c: any) => c !== null));
  const outsider = await fetch(path).then(r => r.json());
  assert.ok(outsider.gameState.players.every((p: any) => p.hand.every((c: any) => c === null)));
  assert.equal(JSON.stringify(own).includes(before!.players[0].guestId!), false);
  assert.notEqual(joined.playerId, created.playerId);
});

test("WebSocket upgrades reject foreign origins and oversized messages", async t => {
  const env = await table(t);
  await assert.rejects(env.connect("https://untrusted.invalid"), /403/);
  const ws = await env.connect("http://localhost:5000");
  assert.deepEqual(await request(ws, "ping", {}, "pong"), {});
  const closed = once(ws, "close");
  ws.send(JSON.stringify({ type: "ping", data: { padding: "x".repeat(17 * 1024) } }));
  assert.equal((await closed)[0], 1009);
});

test("room creation quotas are shared by HTTP and fresh WebSocket connections", async t => {
  const env = await table(t);
  for (let i = 0; i < 30; i++) {
    const result = await fetch(`${env.http}/api/rooms`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName: `Alice ${i}` }) });
    assert.equal(result.status, 200);
  }
  const ws = await env.connect();
  const denied = await request(ws, "room:create", { playerName: "Bob" }, "error");
  assert.equal(denied.code, "ROOM_LIMIT");
  assert.equal((await env.rooms.listActiveRooms()).length, 30);
});

test("WebSocket connection quotas cannot be reset by opening a new connection", async t => {
  const env = await table(t);
  for (let i = 0; i < 120; i++) await env.connect();
  await assert.rejects(env.connect(), /429/);
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
