import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { metrics } from "./metrics";
import { storage } from "./storage";
import type { GameState, Settlement } from "@shared/game-types";
import {
  JoinRoomSchema,
  CreateRoomSchema,
  SetAnteSchema,
  FlopDecisionSchema,
  SubmitSideHandSchema,
  GameGetStateSchema,
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
} from "@shared/game-engine";
import { joinOrReconnectPlayer } from "./room-join";

interface ExtendedWebSocket extends WebSocket {
  playerId?: string;
  roomCode?: string;
  playerName?: string;
  lastPing?: number;
  disconnectTimer?: NodeJS.Timeout;
  messageCount?: number;
  messageWindowStart?: number;
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

  const redactedPlayers = state.players.map((player) => {
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

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const roomConnections = new Map<string, Set<ExtendedWebSocket>>();

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws") {
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
        if (message.type === "state:update" && message.data) {
          const serializedMessage = {
            ...message,
            data: redactGameStateForPlayer(message.data, socket.playerId || ""),
          };
          socket.send(JSON.stringify(serializedMessage));
        } else {
          socket.send(JSON.stringify(message));
        }
        metrics.incrementMessagesSent();
      }
    }
  }

  function sendToSocket(socket: ExtendedWebSocket, message: any): void {
    if (socket.readyState === WebSocket.OPEN) {
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
      const updatedState = await storage.mutateRoom(roomCode, async (gameState) => {
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
        await updatePlayerConnection(socket.roomCode, socket.playerId, false);
      }
    }, 120000);
  }

  function cancelDisconnect(socket: ExtendedWebSocket): void {
    if (socket.disconnectTimer) {
      clearTimeout(socket.disconnectTimer);
      socket.disconnectTimer = undefined;
    }
  }

  wss.on("connection", (socket: ExtendedWebSocket) => {
    updateActiveSocketMetric();
    socket.lastPing = Date.now();

    socket.on("pong", () => {
      socket.lastPing = Date.now();
      cancelDisconnect(socket);
    });

    socket.on("message", async (data) => {
      const now = Date.now();
      if (now - (socket.messageWindowStart || 0) > 1000) {
        socket.messageCount = 0;
        socket.messageWindowStart = now;
      }
      socket.messageCount = (socket.messageCount || 0) + 1;
      if (socket.messageCount > 50) {
        sendError(socket, "RATE_LIMIT_EXCEEDED", "Too many messages");
        return;
      }

      try {
        const message: SocketMessage = JSON.parse(data.toString());
        metrics.incrementMessagesReceived();

        socket.lastPing = Date.now();
        cancelDisconnect(socket);

        switch (message.type) {
          case "ping": {
            sendToSocket(socket, { type: "pong", data: {} });
            break;
          }

          case "room:create": {
            const parsed = CreateRoomSchema.parse(message.data);
            const roomCode = generateRoomCode();
            const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

            const gameState = createGame(
              roomCode,
              parsed.playerName,
              playerId,
              undefined,
              parsed.ante ?? 10,
            );
            await storage.createRoom(gameState);
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
            const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

            try {
              let playerId = newPlayerId;
              const updatedState = await storage.mutateRoom(parsed.roomCode, async (gameState) => {
                const result = joinOrReconnectPlayer(
                  gameState,
                  parsed.playerName,
                  newPlayerId,
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

          case "room:setAnte": {
            if (!socket.roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            const parsed = SetAnteSchema.parse(message.data);

            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
            if (!socket.roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
            if (!socket.roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }
            const botId = message.data?.botId;
            if (typeof botId !== "string") {
              sendError(socket, "INVALID_BOT", "Bot ID required");
              break;
            }
            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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

            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
            if (!socket.roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }

            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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
            if (!socket.roomCode) {
              sendError(socket, "NOT_IN_ROOM", "Not in a room");
              break;
            }

            try {
              const updatedState = await storage.mutateRoom(socket.roomCode, async (gameState) => {
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

            let gameState = await storage.getRoom(roomCode);
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
                socket.playerId = playerId;
                socket.roomCode = roomCode;
                socket.playerName = player.name;
                const updatedState = await updatePlayerConnection(roomCode, playerId, true);
                gameState = updatedState ?? gameState;
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
        console.error("Error handling message:", error);
        sendError(socket, "PARSE_ERROR", "Invalid message format");
      }
    });

    socket.on("close", async () => {
      updateActiveSocketMetric();

      if (socket.roomCode && socket.playerId) {
        const connections = roomConnections.get(socket.roomCode);
        if (connections) {
          connections.delete(socket);
        }

        scheduleDisconnect(socket);
      }
    });

    socket.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });

  setInterval(() => {
    updateActiveSocketMetric();

    roomConnections.forEach((connections) => {
      connections.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.ping();

          const timeSinceLastPing = Date.now() - (socket.lastPing || 0);
          if (timeSinceLastPing > 30000) {
            scheduleDisconnect(socket);
          }
        }
      });
    });
  }, 10000);

  app.post("/api/rooms", async (req, res) => {
    try {
      const parsed = CreateRoomSchema.parse(req.body);
      const roomCode = generateRoomCode();
      const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const gameState = createGame(
        roomCode,
        parsed.playerName,
        playerId,
        undefined,
        parsed.ante ?? 10,
      );
      await storage.createRoom(gameState);
      metrics.incrementRoomsCreated();

      res.json({
        success: true,
        roomCode,
        playerId,
        gameState: redactGameStateForPlayer(gameState, playerId),
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  app.post("/api/rooms/:roomCode/join", async (req, res) => {
    try {
      const { roomCode } = req.params;
      const parsed = JoinRoomSchema.parse(req.body);
      const newPlayerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      let playerId = newPlayerId;
      const updatedState = await storage.mutateRoom(roomCode, async (gameState) => {
        const result = joinOrReconnectPlayer(
          gameState,
          parsed.playerName,
          newPlayerId,
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
      const gameState = await storage.getRoom(roomCode);

      if (!gameState) {
        return res.status(404).json({
          success: false,
          error: "Room not found",
        });
      }

      res.json({
        success: true,
        gameState: redactGameStateForPlayer(gameState, (playerId as string) || ""),
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
