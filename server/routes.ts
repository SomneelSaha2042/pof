import type { Express } from "express";
import { createServer, type Server } from "http";
import { randomUUID, randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { metrics } from "./metrics";
import { storage } from "./storage";
import type { IStorage } from "./storage";
import type { GameState, Settlement } from "@shared/game-types";
import {
  JoinRoomSchema,
  CreateRoomSchema,
  SetAnteSchema,
  FlopDecisionSchema,
  SubmitSideHandSchema,
  GameGetStateSchema,
  RoundRequestSchema,
  ReadyRequestSchema,
} from "@shared/game-types";
import {
  createGame,
  startRound,
  applyFlopDecision,
  submitSideHand,
  setRoomAnte,
  addBotPlayer,
  removeBotPlayer,
  checkInvariants,
  togglePlayerReady,
  leaveGame,
  isTableHost,
} from "@shared/game-engine";
import { joinOrReconnectPlayer } from "./room-join";
import { expireRoomActions } from "./game-deadlines";
import { requestLimit } from "./request-limit";
import { guestSessions } from "./guest-session";

interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
  lastPing?: number;
  disconnectTimer?: NodeJS.Timeout;
  messageCount?: number;
  messageWindowStart?: number;
  clientAddress?: string;
  pendingMessages?: number;
  messageQueue?: Promise<void>;
  guestId?: string;
}

interface SocketMessage {
  type: string;
  data: any;
}

function errorCodeForJoin(error: Error): string {
  if (error.message === "Room not found") return "ROOM_NOT_FOUND";
  if (error.message === "Game already in progress") return "GAME_IN_PROGRESS";
  if (error.message === "A player with that name is already in the room") return "PLAYER_ALREADY_EXISTS";
  return "JOIN_FAILED";
}

/**
 * Redacts sensitive game state for a specific viewer (`viewerPlayerId`):
 * 1. Never exposes undealt `deck` cards.
 * 2. Anonymizes other human players' secret `player.id` tokens (`seat_0`, `seat_1`, ...)
 *    so no client can impersonate another player via HTTP or WebSocket.
 * 3. Hides opponent hole cards and side-game arrangements during active play,
 *    and keeps mucked/uncontested hands hidden even at settlement.
 */
export function redactGameStateForPlayer(
  state: GameState,
  viewerPlayerId: string,
): GameState {
  viewerPlayerId = state.players.find(p => p.id === viewerPlayerId && !p.isBot)?.id ?? "";
  const idMap = new Map<string, string>();
  state.players.forEach((p, idx) => {
    if (p.id === viewerPlayerId || p.isBot) {
      idMap.set(p.id, p.id);
    } else {
      idMap.set(p.id, `seat_${idx}`);
    }
  });

  const mapId = (id: string): string => idMap.get(id) ?? id;

  const potPlayersCount = state.players.filter((p) => p.decision === "pot").length;
  const foldPlayersCount = state.players.filter((p) => p.decision === "fold").length;

  const redactedPlayers = state.players.map(({ guestId: _guestId, ...player }) => {
    const publicId = mapId(player.id);

    // Viewer always sees their own cards
    if (player.id === viewerPlayerId) {
      return {
        ...player,
        id: publicId,
      };
    }

    // Determine if this opponent's cards should be revealed at showdown:
    // - Main pot showdown: 2+ players potted and flop betting is over
    const showMainShowdown =
      (state.phase === "side_game" || state.phase === "settlement") &&
      potPlayersCount >= 2 &&
      player.decision === "pot";

    // - Side game showdown: 2+ players folded and game has reached settlement
    const showSideShowdown =
      state.phase === "settlement" &&
      foldPlayersCount >= 2 &&
      player.decision === "fold";

    if (showMainShowdown) {
      return {
        ...player,
        id: publicId,
        sideArrangement: null,
        sideEvaluation: null,
      };
    }

    if (showSideShowdown) {
      return {
        ...player,
        id: publicId,
      };
    }

    // Otherwise redact hole cards and side game state completely
    return {
      ...player,
      id: publicId,
      hand: Array(player.hand.length).fill(null),
      sideArrangement: null,
      sideEvaluation: null,
    };
  });

  let redactedSettlement: Settlement | null | undefined = state.settlement;
  if (state.settlement) {
    const mapRecordKeys = <T>(rec: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      for (const [k, v] of Object.entries(rec)) {
        out[mapId(k)] = v;
      }
      return out;
    };

    redactedSettlement = {
      ...state.settlement,
      mainPotResult: {
        ...state.settlement.mainPotResult,
        winnerIds: state.settlement.mainPotResult.winnerIds.map(mapId),
        playerEvaluations: mapRecordKeys(
          state.settlement.mainPotResult.playerEvaluations,
        ),
      },
      sideMatchups: state.settlement.sideMatchups.map((m) => ({
        ...m,
        playerAId: mapId(m.playerAId),
        playerBId: mapId(m.playerBId),
        winnerId: m.winnerId ? mapId(m.winnerId) : null,
      })),
      mainPotDeltas: mapRecordKeys(state.settlement.mainPotDeltas),
      sideGameDeltas: mapRecordKeys(state.settlement.sideGameDeltas),
      totalRoundDeltas: mapRecordKeys(state.settlement.totalRoundDeltas),
    };
  }

  return {
    ...state,
    deck: Array(state.deck.length).fill(null),
    players: redactedPlayers,
    settlement: redactedSettlement,
  };
}

export async function registerRoutes(app: Express, roomStorage: IStorage = storage): Promise<Server> {
  if (process.env.NODE_ENV === "production" && (process.env.SESSION_SECRET || "").length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters in production to preserve browser identities across restarts");
  const sessions = guestSessions(process.env.SESSION_SECRET || randomBytes(32).toString("hex"));
  app.use((req, res, next) => {
    res.locals.guestId = sessions.resolve(req.headers.cookie, res);
    next();
  });
  app.get("/api/session", (_req, res) => res.sendStatus(204));
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const roomConnections = new Map<string, Set<ExtendedWebSocket>>();
  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5000").split(",").map(origin => origin.trim());
  if (allowedOrigins.includes("*")) throw new Error("CORS_ORIGIN must list explicit allowed origins");
  const allowConnection = requestLimit(120, 60_000);
  const allowRoomCreation = requestLimit(30, 60_000);
  let creatingRooms = 0;

  async function createRoom(state: GameState, address: string): Promise<void> {
    if (!allowRoomCreation(address)) throw Object.assign(new Error("Room creation rate limit exceeded"), { code: "ROOM_LIMIT" });
    creatingRooms++;
    try {
      if ((await roomStorage.listActiveRooms()).length + creatingRooms > 500) throw Object.assign(new Error("Server room capacity reached"), { code: "ROOM_LIMIT" });
      await roomStorage.createRoom(state);
    } finally {
      creatingRooms--;
    }
  }

  httpServer.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    if (request.headers.origin && !allowedOrigins.includes(request.headers.origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    if (!sessions.read(request.headers.cookie)) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    const address = request.socket.remoteAddress || "unknown";
    const peerConnections = Array.from(wss.clients).filter(client => (client as ExtendedWebSocket).clientAddress === address).length;
    if (!allowConnection(address) || peerConnections >= 120 || wss.clients.size >= 1000) {
      socket.end("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
      return;
    }

    wss.handleUpgrade(request, socket, head, (webSocket) => {
      wss.emit("connection", webSocket, request);
    });
  });

  function generateRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `POF-${result}`;
  }

  function updateActiveSocketMetric(): void {
    metrics.setActiveSockets(wss.clients.size);
  }

  function broadcastToRoom(roomCode: string, message: any, excludeSocket?: ExtendedWebSocket): void {
    const connections = roomConnections.get(roomCode);
    if (!connections) return;

    for (const socket of Array.from(connections)) {
      if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
        sendToSocket(socket, message);
      }
    }
  }

  function sendToSocket(socket: ExtendedWebSocket, message: any): void {
    if (socket.readyState === WebSocket.OPEN) {
      if (socket.bufferedAmount > 256 * 1024) {
        socket.terminate();
        return;
      }
      let serializedMessage = message;
      if (message.type === "state:update" && message.data) {
        serializedMessage = {
          ...message,
          data: redactGameStateForPlayer(message.data, socket.playerId || ""),
        };
      }
      socket.send(JSON.stringify(serializedMessage));
      metrics.incrementMessagesSent();
    }
  }

  function sendError(socket: ExtendedWebSocket, code: string, message: string): void {
    sendToSocket(socket, {
      type: "error",
      data: { code, message },
    });
  }

  function addSocketToRoom(socket: ExtendedWebSocket, roomCode: string): void {
    for (const [code, connections] of Array.from(roomConnections)) {
      if (code !== roomCode) {
        connections.delete(socket);
        if (connections.size === 0) roomConnections.delete(code);
      }
    }
    if (!roomConnections.has(roomCode)) {
      roomConnections.set(roomCode, new Set());
    }
    roomConnections.get(roomCode)!.add(socket);
  }

  async function updatePlayerConnection(
    roomCode: string,
    playerId: string,
    connected: boolean,
  ): Promise<GameState | undefined> {
    try {
      const updatedState = await roomStorage.mutateRoom(roomCode, async (gameState) => {
        const playerIndex = gameState.players.findIndex((player) => player.id === playerId);
        if (playerIndex === -1) {
          return gameState;
        }

        const currentPlayer = gameState.players[playerIndex];
        if (currentPlayer.connected === connected) {
          return gameState;
        }

        const updatedPlayers = [...gameState.players];
        updatedPlayers[playerIndex] = {
          ...currentPlayer,
          connected,
        };

        return {
          ...gameState,
          players: updatedPlayers,
          version: gameState.version + 1,
        };
      });

      broadcastToRoom(roomCode, {
        type: "state:update",
        data: updatedState,
      });

      return updatedState;
    } catch (error) {
      if ((error as Error).message !== "Room not found") {
        console.error("Error updating player connection:", error);
      }
      return undefined;
    }
  }

  function scheduleDisconnect(socket: ExtendedWebSocket): void {
    if (socket.disconnectTimer) {
      clearTimeout(socket.disconnectTimer);
    }

    socket.disconnectTimer = setTimeout(async () => {
      if (socket.roomCode && socket.playerId) {
        const isStillConnected = Array.from(roomConnections.get(socket.roomCode) ?? []).some(other => other !== socket && other.playerId === socket.playerId && other.readyState === WebSocket.OPEN);
        if (isStillConnected) return;
        await updatePlayerConnection(socket.roomCode, socket.playerId, false);
      }
    }, 120000);
    socket.disconnectTimer.unref();
  }

  function cancelDisconnect(socket: ExtendedWebSocket): void {
    if (socket.disconnectTimer) {
      clearTimeout(socket.disconnectTimer);
      socket.disconnectTimer = undefined;
    }
  }

  wss.on("connection", (socket: ExtendedWebSocket, request) => {
    socket.clientAddress = request.socket.remoteAddress || "unknown";
    socket.guestId = sessions.read(request.headers.cookie);
    updateActiveSocketMetric();
    socket.lastPing = Date.now();

    socket.on("pong", () => {
      socket.lastPing = Date.now();
      cancelDisconnect(socket);
    });

    async function handleMessage(data: WebSocket.RawData) {
      if (socket.readyState !== WebSocket.OPEN) return;
      const now = Date.now();
      if (now - (socket.messageWindowStart || 0) > 1000) {
        socket.messageCount = 0;
        socket.messageWindowStart = now;
      }
      socket.messageCount = (socket.messageCount || 0) + 1;
      if (socket.messageCount > 50) {
        socket.close(1008, "Too many messages");
        return;
      }

      try {
        const message: SocketMessage = JSON.parse(data.toString());
        metrics.incrementMessagesReceived();

        socket.lastPing = Date.now();
        cancelDisconnect(socket);

        switch (message.type) {
          case "room:leave": {
            if (socket.roomCode && socket.playerId) {
              const roomCode = socket.roomCode;
              const state = await roomStorage.getRoom(roomCode);
              if (state?.players.some(p => p.id === socket.playerId && !p.isBot)) {
                const next = await roomStorage.mutateRoom(roomCode, current => leaveGame(current, socket.playerId!));
                broadcastToRoom(roomCode, { type: "state:update", data: next }, socket);
              }
              const connections = roomConnections.get(roomCode);
              connections?.delete(socket);
              if (connections?.size === 0) roomConnections.delete(roomCode);
              cancelDisconnect(socket);
              socket.roomCode = undefined;
              socket.playerId = undefined;
              socket.playerName = undefined;
            }
            sendToSocket(socket, { type: "room:left", data: {} });
            break;
          }
          case "ping": {
            sendToSocket(socket, { type: "pong", data: {} });
            break;
          }

          case "room:create": {
            const parsed = CreateRoomSchema.parse(message.data);
            const roomCode = generateRoomCode();
            const playerId = `player_${randomUUID()}`;

            const gameState = createGame(
              roomCode,
              parsed.playerName,
              playerId,
              undefined,
              parsed.ante ?? 10,
              socket.guestId,
            );
            await createRoom(gameState, socket.clientAddress!);
            metrics.incrementRoomsCreated();

            socket.playerId = playerId;
            socket.roomCode = roomCode;
            socket.playerName = parsed.playerName;
            addSocketToRoom(socket, roomCode);

            sendToSocket(socket, {
              type: "room:created",
              data: { roomCode, playerId },
            });

            sendToSocket(socket, {
              type: "state:update",
              data: gameState,
            });

            break;
          }

          case "room:join": {
            const parsed = JoinRoomSchema.parse(message.data);
            const newPlayerId = `player_${randomUUID()}`;

            try {
              let playerId = newPlayerId;
              const updatedState = await roomStorage.mutateRoom(parsed.roomCode, async (gameState) => {
                const result = joinOrReconnectPlayer(
                  gameState,
                  parsed.playerName,
                  newPlayerId,
                  parsed.playerId,
                  socket.guestId,
                );
                playerId = result.playerId;
                return result.state;
              });

              socket.playerId = playerId;
              socket.roomCode = parsed.roomCode;
              socket.playerName = parsed.playerName;
              addSocketToRoom(socket, parsed.roomCode);

              sendToSocket(socket, {
                type: "room:joined",
                data: { roomCode: parsed.roomCode, playerId },
              });

              broadcastToRoom(parsed.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              const err = error as Error;
              sendError(socket, errorCodeForJoin(err), err.message);
            }

            break;
          }

          case "room:spectate": {
            const rawCode =
              typeof message.data?.roomCode === "string"
                ? message.data.roomCode.trim().toUpperCase()
                : "";
            if (!rawCode) {
              sendError(socket, "INVALID_ROOM_CODE", "Room code is required");
              break;
            }

            const gameState = await roomStorage.getRoom(rawCode);
            if (!gameState) {
              sendError(socket, "ROOM_NOT_FOUND", "Room not found");
              break;
            }

            const spectatorId = `spectator_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            socket.playerId = spectatorId;
            socket.roomCode = rawCode;
            socket.playerName = "Spectator";
            addSocketToRoom(socket, rawCode);

            sendToSocket(socket, {
              type: "room:spectating",
              data: { roomCode: rawCode, playerId: spectatorId },
            });

            sendToSocket(socket, {
              type: "state:update",
              data: gameState,
            });
            break;
          }

          case "room:setAnte": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            const parsed = SetAnteSchema.parse(message.data);

            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const isSeated = isTableHost(gameState, socket.playerId!);
                if (!isSeated) {
                  throw new Error("Only the table host can change the ante");
                }
                return setRoomAnte(gameState, parsed.ante);
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
                notification: {
                  message: `Table ante set to ${parsed.ante}`,
                  type: "info",
                },
              });
            } catch (error) {
              sendError(socket, "SET_ANTE_FAILED", (error as Error).message);
            }
            break;
          }

          case "room:addBot": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const isSeated = isTableHost(gameState, socket.playerId!);
                if (!isSeated) {
                  throw new Error("Only the table host can add bots");
                }
                return addBotPlayer(gameState);
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              sendError(socket, "ADD_BOT_FAILED", (error as Error).message);
            }
            break;
          }

          case "room:removeBot": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            const botId = message.data?.botId;
            if (typeof botId !== "string") {
              sendError(socket, "INVALID_BOT", "Bot ID required");
              break;
            }
            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const isSeated = isTableHost(gameState, socket.playerId!);
                if (!isSeated) {
                  throw new Error("Only the table host can remove bots");
                }
                return removeBotPlayer(gameState, botId);
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              sendError(socket, "REMOVE_BOT_FAILED", (error as Error).message);
            }
            break;
          }

          case "player:ready": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_GAME", "Not in a game");
              break;
            }

            const parsed = ReadyRequestSchema.parse(message.data);
            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                if (parsed.ante !== gameState.ante || parsed.roundNumber !== gameState.roundNumber) throw new Error("Table stakes or round changed; confirm readiness again");
                const next = togglePlayerReady(gameState, socket.playerId!);
                if (process.env.NODE_ENV !== "production") {
                  checkInvariants(next);
                }
                return next;
              });

              const player = updatedState.players.find((p) => p.id === socket.playerId);
              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
                notification: {
                  message: `${player?.name || "Player"} is ${player?.ready ? "ready" : "not ready"}`,
                  type: "info",
                },
              });
            } catch (error) {
              sendError(socket, "READY_FAILED", (error as Error).message);
            }

            break;
          }

          case "game:start": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }

            const parsed = RoundRequestSchema.parse(message.data);
            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const isSeated = isTableHost(gameState, socket.playerId!);
                if (!isSeated) {
                  throw new Error("Only the table host can start the game");
                }
                if (gameState.phase !== "lobby" || parsed.roundNumber !== gameState.roundNumber) throw new Error("Stale start request");
                const next = startRound(gameState);
                if (process.env.NODE_ENV !== "production") {
                  checkInvariants(next);
                }
                return next;
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              sendError(socket, "START_FAILED", (error as Error).message);
            }

            break;
          }

          case "turn:decision": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_GAME", "Not in a game");
              break;
            }

            const parsed = FlopDecisionSchema.parse(message.data);
            let actorName = "Player";

            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const actor = gameState.players.find((p) => p.id === socket.playerId);
                actorName = actor?.name || "Player";
                const next = applyFlopDecision(gameState, socket.playerId!, parsed.decision);
                if (process.env.NODE_ENV !== "production") {
                  checkInvariants(next);
                }
                return next;
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
                notification: {
                  message:
                    parsed.decision === "pot"
                      ? `${actorName} POTTED (+${updatedState.initialPot})`
                      : `${actorName} FOLDED to the Side Game`,
                  type: "info",
                },
              });
            } catch (error) {
              sendError(socket, "DECISION_FAILED", (error as Error).message);
            }

            break;
          }

          case "side:submit": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_GAME", "Not in a game");
              break;
            }

            const parsed = SubmitSideHandSchema.parse(message.data || {});

            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const next = submitSideHand(
                  gameState,
                  socket.playerId!,
                  parsed.arrangement as any,
                );
                if (process.env.NODE_ENV !== "production") {
                  checkInvariants(next);
                }
                return next;
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              sendError(socket, "SIDE_SUBMIT_FAILED", (error as Error).message);
            }

            break;
          }

          case "round:new": {
            if (!socket.roomCode || !socket.playerId) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }

            const parsed = RoundRequestSchema.parse(message.data);
            try {
              const updatedState = await roomStorage.mutateRoom(socket.roomCode, async (gameState) => {
                const isSeated = isTableHost(gameState, socket.playerId!);
                if (!isSeated) {
                  throw new Error("Only the table host can deal the next hand");
                }
                if (gameState.phase !== "settlement" || parsed.roundNumber !== gameState.roundNumber) throw new Error("Stale next-hand request");
                const next = startRound(gameState);
                if (process.env.NODE_ENV !== "production") {
                  checkInvariants(next);
                }
                return next;
              });

              broadcastToRoom(socket.roomCode, {
                type: "state:update",
                data: updatedState,
              });
            } catch (error) {
              sendError(socket, "NEW_ROUND_FAILED", (error as Error).message);
            }

            break;
          }

          case "game:getState": {
            const parsed = GameGetStateSchema.parse(message.data || {});
            const roomCode = socket.roomCode || parsed.roomCode;
            // Prevent a bound socket from spoofing another player's ID
            const playerId = socket.playerId || parsed.playerId;

            if (!roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }

            let gameState = await roomStorage.getRoom(roomCode);
            if (!gameState) {
              sendError(socket, "ROOM_NOT_FOUND", "Room not found");
              break;
            }

            if (playerId && !socket.playerId) {
              // Only allow binding to an actual secret player.id (never a public 'seat_X' alias)
              const player = gameState.players.find(
                (p) => p.id === playerId && !p.isBot,
              );
              if (player) {
                if (player.guestId && player.guestId !== socket.guestId) {
                  sendError(socket, "SESSION_MISMATCH", "This seat belongs to another browser session");
                  break;
                }
                if (!player.guestId) {
                  gameState = await roomStorage.mutateRoom(roomCode, state => {
                    if (state.players.some(p => p.id !== playerId && p.guestId === socket.guestId)) throw new Error("This browser already has a seat at this table");
                    return { ...state, players: state.players.map(p => p.id === playerId ? { ...p, guestId: socket.guestId } : p), version: state.version + 1 };
                  });
                }
                socket.playerId = playerId;
                socket.roomCode = roomCode;
                socket.playerName = player.name;
                const updatedState = await updatePlayerConnection(roomCode, playerId, true);
                gameState = updatedState ?? gameState;
              } else if (playerId.startsWith("spectator_")) {
                socket.playerId = playerId;
                socket.roomCode = roomCode;
                socket.playerName = "Spectator";
              }
            }

            if (socket.roomCode) {
              addSocketToRoom(socket, socket.roomCode);
            }

            sendToSocket(socket, {
              type: "state:update",
              data: gameState,
            });

            break;
          }

          default:
            sendError(socket, "UNKNOWN_MESSAGE", `Unknown message type: ${message.type}`);
        }
      } catch (error) {
        if ((error as { code?: string }).code === "ROOM_LIMIT") {
          sendError(socket, "ROOM_LIMIT", (error as Error).message);
          return;
        }
        console.error("Error handling message:", error);
        sendError(socket, "PARSE_ERROR", "Invalid message format");
      }
    }
    socket.on("message", (data, isBinary) => {
      if (isBinary || (socket.pendingMessages || 0) >= 8) {
        socket.close(1008, "Too many pending messages or invalid frame");
        return;
      }
      socket.pendingMessages = (socket.pendingMessages || 0) + 1;
      socket.messageQueue = (socket.messageQueue ?? Promise.resolve())
        .then(() => handleMessage(data))
        .catch(error => console.error("Socket action failed:", error))
        .finally(() => { socket.pendingMessages!--; });
    });

    socket.on("close", async () => {
      updateActiveSocketMetric();

      if (socket.roomCode && socket.playerId) {
        const connections = roomConnections.get(socket.roomCode);
        if (connections) {
          connections.delete(socket);
          if (connections.size === 0) roomConnections.delete(socket.roomCode);
        }

        scheduleDisconnect(socket);
      }
    });

    socket.on("error", (error) => {
      if ((error as { code?: string }).code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") return;
      console.error("WebSocket error:", error);
    });
  });

  const heartbeat = setInterval(() => {
    updateActiveSocketMetric();

    wss.clients.forEach((client) => {
        const socket = client as ExtendedWebSocket;
        if (socket.readyState === WebSocket.OPEN) {
          socket.ping();

          const timeSinceLastPing = Date.now() - (socket.lastPing || 0);
          if (timeSinceLastPing > 30000) socket.terminate();
        }
    });
  }, 10000);
  let expiring = false;
  const deadlines = setInterval(async () => {
    if (expiring) return;
    expiring = true;
    try {
      await expireRoomActions(roomStorage, state => broadcastToRoom(state.roomCode, { type: "state:update", data: state }));
    } catch (error) {
      console.error("Error advancing game deadlines:", error);
    } finally {
      expiring = false;
    }
  }, 1000);
  httpServer.on("close", () => {
    clearInterval(heartbeat);
    clearInterval(deadlines);
    wss.close();
  });

  app.post("/api/rooms", async (req, res) => {
    try {
      const parsed = CreateRoomSchema.parse(req.body);
      const roomCode = generateRoomCode();
      const playerId = `player_${randomUUID()}`;

      const gameState = createGame(
        roomCode,
        parsed.playerName,
        playerId,
        undefined,
        parsed.ante ?? 10,
        res.locals.guestId,
      );
      await createRoom(gameState, req.socket.remoteAddress || "unknown");
      metrics.incrementRoomsCreated();

      res.json({
        success: true,
        roomCode,
        playerId,
        gameState: redactGameStateForPlayer(gameState, playerId),
      });
    } catch (error) {
      res.status((error as { code?: string }).code === "ROOM_LIMIT" ? 429 : 400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/rooms/:roomCode/join", async (req, res) => {
    try {
      const { roomCode } = req.params;
      const parsed = JoinRoomSchema.parse(req.body);
      const newPlayerId = `player_${randomUUID()}`;

      let playerId = newPlayerId;
      const updatedState = await roomStorage.mutateRoom(roomCode, async (gameState) => {
        const result = joinOrReconnectPlayer(
          gameState,
          parsed.playerName,
          newPlayerId,
          parsed.playerId,
          res.locals.guestId,
        );
        playerId = result.playerId;
        return result.state;
      });

      broadcastToRoom(roomCode, {
        type: "state:update",
        data: updatedState,
      });

      res.json({
        success: true,
        playerId,
        gameState: redactGameStateForPlayer(updatedState, playerId),
      });
    } catch (error) {
      const err = error as Error;
      const code = errorCodeForJoin(err);
      const status = code === "ROOM_NOT_FOUND" ? 404 : 400;

      res.status(status).json({
        success: false,
        error: err.message,
      });
    }
  });

  app.get("/api/rooms/:roomCode", async (req, res) => {
    try {
      const { roomCode } = req.params;
      const { playerId } = req.query;
      const gameState = await roomStorage.getRoom(roomCode);

      if (!gameState) {
        return res.status(404).json({
          success: false,
          error: "Room not found",
        });
      }

      const viewer = gameState.players.find(p => p.id === playerId && !p.isBot);
      const viewerId = viewer && (!viewer.guestId || viewer.guestId === res.locals.guestId) ? viewer.id : "";
      res.json({
        success: true,
        gameState: redactGameStateForPlayer(gameState, viewerId),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  return httpServer;
}
