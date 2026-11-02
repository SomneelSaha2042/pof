import WebSocket from "ws";
import type { Card, GameState, SideHandArrangement } from "../shared/game-types";
import {
  cardToString,
  computeBestSideArrangement,
  evaluateBestOmahaHand,
} from "../shared/game-engine";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    } else {
      positionals.push(token);
    }
  }
  return { command: positionals[0], args };
}

function toWsUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  if (clean.startsWith("https://")) {
    return clean.replace(/^https:\/\//, "wss://") + "/ws";
  }
  if (clean.startsWith("http://")) {
    return clean.replace(/^http:\/\//, "ws://") + "/ws";
  }
  if (clean.startsWith("ws://") || clean.startsWith("wss://")) {
    return clean.endsWith("/ws") ? clean : `${clean}/ws`;
  }
  return `ws://${clean}/ws`;
}

function parseCardToken(token: string): Card {
  const clean = token.trim().toUpperCase();
  const suitChar = clean.slice(-1) as Card["s"];
  const rankStr = clean.slice(0, -1);
  let r: number;
  if (rankStr === "A") r = 1;
  else if (rankStr === "J") r = 11;
  else if (rankStr === "Q") r = 12;
  else if (rankStr === "K") r = 13;
  else r = parseInt(rankStr, 10);

  if (!["C", "D", "H", "S"].includes(suitChar) || Number.isNaN(r) || r < 1 || r > 13) {
    throw new Error(`Invalid card token: ${token}`);
  }
  return { r: r as Card["r"], s: suitChar };
}

function summarizeStateForAgent(state: GameState, playerId: string) {
  const me = state.players.find((p) => p.id === playerId);
  const myValidCards = (me?.hand ?? []).filter((c): c is Card => c !== null);
  const currentTurnPlayer = state.players[state.turnIdx];
  const buttonPlayer = state.players[state.buttonIdx];

  // Security audit check from this player's perspective
  const leakedOpponentIds = state.players
    .filter((p) => p.id !== playerId && !p.isBot)
    .filter((p) => !p.id.startsWith("seat_"))
    .map((p) => p.id);

  const leakedDeckCards = state.deck.filter((c) => c !== null).length;

  const leakedOpponentHandsInFlop =
    state.phase === "pot_or_fold"
      ? state.players
          .filter((p) => p.id !== playerId)
          .filter((p) => p.hand.some((c) => c !== null))
          .map((p) => p.name)
      : [];

  let actionNeeded = "WAIT";
  if (
    state.phase === "pot_or_fold" &&
    currentTurnPlayer?.id === playerId &&
    me?.decision === "pending"
  ) {
    actionNeeded = "FLOP_DECISION";
  } else if (
    state.phase === "side_game" &&
    me?.decision === "fold" &&
    !me?.sideLocked
  ) {
    actionNeeded = "SIDE_GAME_ARRANGEMENT";
  } else if (state.phase === "settlement") {
    actionNeeded = "SETTLEMENT";
  }

  const omahaHelper =
    myValidCards.length === 5 && state.communityCards.length >= 3
      ? evaluateBestOmahaHand(myValidCards, state.communityCards).label
      : null;

  const sideHelper =
    myValidCards.length === 5
      ? computeBestSideArrangement(myValidCards)
      : null;

  return {
    roomCode: state.roomCode,
    roundNumber: state.roundNumber,
    phase: state.phase,
    actionNeeded,
    ante: state.ante,
    initialPotToMatch: state.initialPot,
    mainPot: state.mainPot,
    carryoverPot: state.carryoverPot,
    buttonPlayer: buttonPlayer?.name,
    currentTurnPlayer: currentTurnPlayer?.name,
    communityCards: state.communityCards.map(cardToString),
    mySeat: me
      ? {
          name: me.name,
          decision: me.decision,
          sideLocked: me.sideLocked,
          chipDelta: me.chipDelta,
          currentHandDelta: me.currentHandDelta,
          holeCards: myValidCards.map(cardToString),
          holeCardsRaw: myValidCards.map((c) => {
            const rLbl =
              c.r === 1
                ? "A"
                : c.r === 11
                ? "J"
                : c.r === 12
                ? "Q"
                : c.r === 13
                ? "K"
                : String(c.r);
            return `${rLbl}${c.s}`;
          }),
          bestOmahaHand: omahaHelper,
          optimalSideHand: sideHelper
            ? {
                tier: sideHelper.tier,
                multiplier: sideHelper.multiplier,
                label: sideHelper.tierLabel,
                highBoard: sideHelper.arrangement.highBoard.map(cardToString),
                lowBoard: sideHelper.arrangement.lowBoard.map(cardToString),
                unused: cardToString(sideHelper.arrangement.unusedCard),
              }
            : null,
        }
      : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      decision: p.decision,
      sideLocked: p.sideLocked,
      chipDelta: p.chipDelta,
      visibleCards: p.hand.filter((c): c is Card => c !== null).map(cardToString),
    })),
    settlement: state.settlement
      ? {
          mainPotOutcome: state.settlement.mainPotResult.outcome,
          mainPotAmount: state.settlement.mainPotResult.potAmount,
          mainPotWinners: state.settlement.mainPotResult.winnerIds,
          sideMatchups: state.settlement.sideMatchups,
          totalRoundDeltas: state.settlement.totalRoundDeltas,
        }
      : null,
    securityCheck: {
      opponentIdsAnonymized: leakedOpponentIds.length === 0,
      deckRedacted: leakedDeckCards === 0,
      opponentFlopCardsHidden: leakedOpponentHandsInFlop.length === 0,
    },
  };
}

async function wsSession<T>(
  baseUrl: string,
  handler: (ws: WebSocket, send: (type: string, data?: any) => void) => Promise<T>,
  timeoutMs = 30000,
): Promise<T> {
  const wsUrl = toWsUrl(baseUrl);
  const ws = new WebSocket(wsUrl);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`WebSocket operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const send = (type: string, data: any = {}) => {
      ws.send(JSON.stringify({ type, data }));
    };

    ws.on("open", async () => {
      try {
        const result = await handler(ws, send);
        clearTimeout(timer);
        ws.close();
        resolve(result);
      } catch (err) {
        clearTimeout(timer);
        ws.close();
        reject(err);
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function setupRoom(baseUrl: string, playerNames: string[], ante: number) {
  const cleanUrl = baseUrl.replace(/\/+$/, "");

  // 1. Create room via HTTP as player 0
  const createRes = await fetch(`${cleanUrl}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerName: playerNames[0], ante }),
  });
  const createData = (await createRes.json()) as any;
  if (!createData.success) {
    throw new Error(`Failed to create room: ${createData.error}`);
  }

  const roomCode: string = createData.roomCode;
  const players: { name: string; playerId: string }[] = [
    { name: playerNames[0], playerId: createData.playerId },
  ];

  // 2. Join remaining players via HTTP
  for (let i = 1; i < playerNames.length; i++) {
    const joinRes = await fetch(`${cleanUrl}/api/rooms/${roomCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, playerName: playerNames[i] }),
    });
    const joinData = (await joinRes.json()) as any;
    if (!joinData.success) {
      throw new Error(`Failed to join ${playerNames[i]}: ${joinData.error}`);
    }
    players.push({ name: playerNames[i], playerId: joinData.playerId });
  }

  // 3. Ready up all players over WebSocket and start Hand #1
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const isLast = i === players.length - 1;
    await wsSession(baseUrl, (ws, send) => {
      return new Promise<void>((resolve, reject) => {
        let step = 0;
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "error") {
            reject(new Error(msg.data?.message || "WS Error"));
            return;
          }
          if (msg.type === "state:update") {
            step++;
            if (step === 1) {
              send("player:ready");
            } else if (step === 2) {
              if (isLast) {
                send("game:start");
              } else {
                resolve();
              }
            } else if (step === 3) {
              resolve();
            }
          }
        });
        send("game:getState", { roomCode, playerId: p.playerId });
      });
    });
  }

  console.log(JSON.stringify({ roomCode, ante, players }, null, 2));
}

async function waitForAction(
  baseUrl: string,
  roomCode: string,
  playerId: string,
  targetRound?: number,
  timeoutMs = 60000,
) {
  const summary = await wsSession(
    baseUrl,
    (ws, send) => {
      return new Promise<any>((resolve, reject) => {
        const pollInterval = setInterval(() => {
          send("game:getState", { roomCode, playerId });
        }, 400);

        ws.on("close", () => clearInterval(pollInterval));

        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "error") {
            clearInterval(pollInterval);
            reject(new Error(msg.data?.message || "WS error"));
            return;
          }
          if (msg.type === "state:update" && msg.data) {
            const state: GameState = msg.data;
            if (targetRound && state.roundNumber < targetRound) {
              return;
            }
            const sum = summarizeStateForAgent(state, playerId);
            if (
              sum.actionNeeded !== "WAIT" ||
              (targetRound !== undefined && state.roundNumber > targetRound)
            ) {
              clearInterval(pollInterval);
              resolve(sum);
            }
          }
        });

        send("game:getState", { roomCode, playerId });
      });
    },
    timeoutMs,
  );

  console.log(JSON.stringify(summary, null, 2));
}

async function submitFlopDecision(
  baseUrl: string,
  roomCode: string,
  playerId: string,
  decision: "pot" | "fold",
) {
  const summary = await wsSession(baseUrl, (ws, send) => {
    return new Promise<any>((resolve, reject) => {
      let bound = false;
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "error") {
          reject(new Error(msg.data?.message || "WS error"));
          return;
        }
        if (msg.type === "state:update" && msg.data) {
          if (!bound) {
            bound = true;
            send("turn:decision", { decision });
          } else {
            resolve(summarizeStateForAgent(msg.data, playerId));
          }
        }
      });
      send("game:getState", { roomCode, playerId });
    });
  });

  console.log(JSON.stringify(summary, null, 2));
}

async function submitSideArrangement(
  baseUrl: string,
  roomCode: string,
  playerId: string,
  highStr?: string,
  lowStr?: string,
  unusedStr?: string,
) {
  let arrangement: SideHandArrangement | undefined;
  if (highStr && lowStr && unusedStr) {
    const highCards = highStr.split(",").map(parseCardToken);
    const lowCards = lowStr.split(",").map(parseCardToken);
    const unusedCard = parseCardToken(unusedStr);
    if (highCards.length === 2 && lowCards.length === 2) {
      arrangement = {
        highBoard: [highCards[0], highCards[1]],
        lowBoard: [lowCards[0], lowCards[1]],
        unusedCard,
      };
    }
  }

  const summary = await wsSession(baseUrl, (ws, send) => {
    return new Promise<any>((resolve, reject) => {
      let bound = false;
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "error") {
          reject(new Error(msg.data?.message || "WS error"));
          return;
        }
        if (msg.type === "state:update" && msg.data) {
          if (!bound) {
            bound = true;
            send("side:submit", arrangement ? { arrangement } : {});
          } else {
            resolve(summarizeStateForAgent(msg.data, playerId));
          }
        }
      });
      send("game:getState", { roomCode, playerId });
    });
  });

  console.log(JSON.stringify(summary, null, 2));
}

async function triggerNextHand(
  baseUrl: string,
  roomCode: string,
  playerId: string,
) {
  await new Promise((r) => setTimeout(r, 3500));
  const summary = await wsSession(baseUrl, (ws, send) => {
    return new Promise<any>((resolve, reject) => {
      let bound = false;
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "error") {
          reject(new Error(msg.data?.message || "WS error"));
          return;
        }
        if (msg.type === "state:update" && msg.data) {
          const state: GameState = msg.data;
          if (!bound) {
            bound = true;
            if (state.phase === "settlement") {
              send("round:new", {});
            } else {
              resolve(summarizeStateForAgent(state, playerId));
            }
          } else {
            resolve(summarizeStateForAgent(state, playerId));
          }
        }
      });
      send("game:getState", { roomCode, playerId });
    });
  });

  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  const baseUrl = args.url || process.env.POF_URL || "http://localhost:5000";

  switch (command) {
    case "setup-room": {
      const names = (args.players || "Alice,Bob,Charlie,Diana")
        .split(",")
        .map((s) => s.trim());
      const ante = parseInt(args.ante || "10", 10);
      await setupRoom(baseUrl, names, ante);
      break;
    }
    case "wait": {
      if (!args.room || !args.player) {
        throw new Error("--room and --player required");
      }
      const round = args.round ? parseInt(args.round, 10) : undefined;
      const timeout = args.timeout ? parseInt(args.timeout, 10) : 60000;
      await waitForAction(baseUrl, args.room, args.player, round, timeout);
      break;
    }
    case "decide": {
      if (!args.room || !args.player || !args.decision) {
        throw new Error("--room, --player, and --decision <pot|fold> required");
      }
      const dec = args.decision.toLowerCase();
      if (dec !== "pot" && dec !== "fold") {
        throw new Error("--decision must be 'pot' or 'fold'");
      }
      await submitFlopDecision(baseUrl, args.room, args.player, dec);
      break;
    }
    case "side": {
      if (!args.room || !args.player) {
        throw new Error("--room and --player required");
      }
      await submitSideArrangement(
        baseUrl,
        args.room,
        args.player,
        args.high,
        args.low,
        args.unused,
      );
      break;
    }
    case "next-hand": {
      if (!args.room || !args.player) {
        throw new Error("--room and --player required");
      }
      await triggerNextHand(baseUrl, args.room, args.player);
      break;
    }
    default:
      throw new Error(
        `Unknown command '${command}'. Use setup-room, wait, decide, side, or next-hand.`,
      );
  }
}

main().catch((err) => {
  console.error("CLI Error:", err.message);
  process.exit(1);
});
