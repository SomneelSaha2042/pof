import WebSocket from "ws";

type Message = {
  type: string;
  data: any;
};

type ClientState = {
  id: number;
  roomIndex: number;
  name: string;
  ws: WebSocket;
  roomCode?: string;
  playerId?: string;
  latestState?: any;
  pendingActionAt?: number;
};

const args = new Map<string, string>();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) {
    args.set(match[1], match[2]);
  }
}

const targetUrl = args.get("url") ?? process.env.WS_URL ?? "ws://localhost:5000/ws";
const roomCount = Number(args.get("rooms") ?? process.env.ROOMS ?? 20);
const playersPerRoom = Number(args.get("players") ?? process.env.PLAYERS_PER_ROOM ?? 5);
const durationMs = Number(args.get("durationMs") ?? process.env.DURATION_MS ?? 10 * 60 * 1000);
const minActionMs = Number(args.get("minActionMs") ?? process.env.MIN_ACTION_MS ?? 2000);
const maxActionMs = Number(args.get("maxActionMs") ?? process.env.MAX_ACTION_MS ?? 5000);

const clients: ClientState[] = [];
const latencies: number[] = [];
let errors = 0;
let disconnects = 0;
let messagesSent = 0;
let messagesReceived = 0;

function randomBetween(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function send(client: ClientState, type: string, data: any = {}, trackLatency = false): boolean {
  if (client.ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  if (trackLatency) {
    client.pendingActionAt = Date.now();
  }

  client.ws.send(JSON.stringify({ type, data }));
  messagesSent += 1;
  return true;
}

function waitForMessage(client: ClientState, type: string, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    const handler = (raw: WebSocket.RawData) => {
      const message = JSON.parse(raw.toString()) as Message;
      if (message.type === type) {
        cleanup();
        resolve(message.data);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      client.ws.off("message", handler);
    };

    client.ws.on("message", handler);
  });
}

function connectClient(id: number, roomIndex: number): Promise<ClientState> {
  return new Promise((resolve, reject) => {
    const client: ClientState = {
      id,
      roomIndex,
      name: `LoadUser_${id}`,
      ws: new WebSocket(targetUrl),
    };

    const timer = setTimeout(() => reject(new Error(`Client ${id} connect timeout`)), 10000);

    client.ws.on("open", () => {
      clearTimeout(timer);
      resolve(client);
    });

    client.ws.on("message", (raw) => {
      messagesReceived += 1;

      try {
        const message = JSON.parse(raw.toString()) as Message;
        if (message.type === "state:update") {
          client.latestState = message.data;
          if (client.pendingActionAt) {
            latencies.push(Date.now() - client.pendingActionAt);
            client.pendingActionAt = undefined;
          }
        } else if (message.type === "error") {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
    });

    client.ws.on("close", () => {
      disconnects += 1;
    });

    client.ws.on("error", () => {
      errors += 1;
    });
  });
}

async function createRoom(owner: ClientState): Promise<string> {
  send(owner, "room:create", { playerName: owner.name });
  const created = await waitForMessage(owner, "room:created");
  owner.roomCode = created.roomCode;
  owner.playerId = created.playerId;
  return created.roomCode;
}

async function joinRoom(client: ClientState, roomCode: string): Promise<void> {
  send(client, "room:join", { roomCode, playerName: client.name });
  const joined = await waitForMessage(client, "room:joined");
  client.roomCode = joined.roomCode;
  client.playerId = joined.playerId;
}

function chooseAction(client: ClientState): { type: string; data?: any } | undefined {
  const state = client.latestState;
  if (!state || !client.playerId) return { type: "game:getState", data: { roomCode: client.roomCode, playerId: client.playerId } };

  const player = state.players?.find((candidate: any) => candidate.id === client.playerId);
  if (!player) return undefined;

  if (state.phase === "lobby") {
    if (!player.ready) return { type: "player:ready" };
    if (state.players.length >= 2 && state.players.every((candidate: any) => candidate.ready)) {
      return { type: "game:start" };
    }
    return undefined;
  }

  if (state.phase === "settlement") {
    return { type: "round:new" };
  }

  if (state.phase !== "playing" || state.players[state.turnIdx]?.id !== client.playerId) {
    return undefined;
  }

  if (state.turnStage === "start") {
    const hand = player.hand ?? [];
    if (hand.length > 0) {
      return { type: "turn:drop", data: { drop: { kind: "single", cards: [hand[0]] } } };
    }
  }

  if (state.turnStage === "dropped") {
    if (state.tableDrop?.cards?.length && Math.random() < 0.35) {
      return { type: "turn:drawFromTable", data: { cardIndex: 0 } };
    }
    return { type: "turn:drawDeck" };
  }

  return undefined;
}

async function setup(): Promise<void> {
  console.log(`Connecting ${roomCount * playersPerRoom} clients to ${targetUrl}`);

  for (let roomIndex = 0; roomIndex < roomCount; roomIndex++) {
    const owner = await connectClient(clients.length + 1, roomIndex);
    clients.push(owner);
    const roomCode = await createRoom(owner);

    for (let playerIndex = 1; playerIndex < playersPerRoom; playerIndex++) {
      const client = await connectClient(clients.length + 1, roomIndex);
      clients.push(client);
      await joinRoom(client, roomCode);
    }
  }
}

function runActions(): NodeJS.Timeout {
  return setInterval(() => {
    for (const client of clients) {
      const action = chooseAction(client);
      if (action) {
        send(client, action.type, action.data ?? {}, true);
      }
    }
  }, randomBetween(minActionMs, maxActionMs));
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  await setup();
  console.log("Setup complete. Starting action loop.");

  const interval = runActions();
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  clearInterval(interval);

  for (const client of clients) {
    client.ws.close();
  }

  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(JSON.stringify({
    targetUrl,
    elapsedSeconds,
    clients: clients.length,
    rooms: roomCount,
    playersPerRoom,
    messagesSent,
    messagesReceived,
    errors,
    disconnects,
    latency: {
      samples: latencies.length,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
