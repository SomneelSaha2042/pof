import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../shared/game-engine";
import { joinOrReconnectPlayer } from "./room-join";

test("rejoining a seat requires its secret token, even when disconnected", () => {
  const game = createGame("FF-TEST01", "Sam", "player_1");
  const disconnected = {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      connected: false,
    })),
  };

  for (const state of [game, disconnected]) {
    assert.throws(() => joinOrReconnectPlayer(state, "Sam", "player_2"), /already in the room/);
    assert.throws(() => joinOrReconnectPlayer(state, "sam", "player_2", "wrong"), /already in the room/);
  }
  const result = joinOrReconnectPlayer(disconnected, "Sam", "player_2", "player_1");

  assert.equal(result.playerId, "player_1");
  assert.equal(result.rejoined, true);
  assert.equal(result.state.players.length, 1);
  assert.equal(result.state.players[0].connected, true);
  assert.equal(result.state.version, disconnected.version + 1);
});

test("joining a lobby room with a new name adds a new player", () => {
  const game = createGame("FF-TEST01", "Sam", "player_1");

  const result = joinOrReconnectPlayer(game, "Mina", "player_2");

  assert.equal(result.playerId, "player_2");
  assert.equal(result.rejoined, false);
  assert.equal(result.state.players.length, 2);
  assert.equal(result.state.players[1].name, "Mina");
});
