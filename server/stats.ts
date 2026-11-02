import { sql, eq, desc } from "drizzle-orm";
import { db } from "./db";
import { users, roundHistory } from "@shared/schema";
import type { GameState } from "@shared/game-types";

export async function persistSettlement(state: GameState): Promise<void> {
  const payouts = state.settlement?.payouts;
  if (!payouts) return;

  const entries = state.players
    .map((player, idx) => ({ userId: player.userId, payout: payouts[idx] }))
    .filter((entry): entry is { userId: string; payout: number } => Boolean(entry.userId));

  await Promise.all(
    entries.map(async ({ userId, payout }) => {
      try {
        await db.transaction(async (tx) => {
          await tx.insert(roundHistory).values({
            userId,
            roomCode: state.roomCode,
            roundNumber: state.roundNumber,
            payout,
          });

          if (payout > 0) {
            await tx
              .update(users)
              .set({
                chipsWon: sql`${users.chipsWon} + ${payout}`,
                roundsWon: sql`${users.roundsWon} + 1`,
              })
              .where(eq(users.id, userId));
          } else if (payout < 0) {
            await tx
              .update(users)
              .set({ chipsLost: sql`${users.chipsLost} + ${-payout}` })
              .where(eq(users.id, userId));
          }
        });
      } catch (error) {
        console.error(`Failed to persist settlement for user ${userId}:`, error);
      }
    }),
  );
}

export async function getRecentRounds(userId: string, limit = 5) {
  return db
    .select({
      roomCode: roundHistory.roomCode,
      roundNumber: roundHistory.roundNumber,
      payout: roundHistory.payout,
      createdAt: roundHistory.createdAt,
    })
    .from(roundHistory)
    .where(eq(roundHistory.userId, userId))
    .orderBy(desc(roundHistory.createdAt))
    .limit(limit);
}

// Both leaderboards read straight off `users` — bounded by account count, not
// by total rounds ever played, so this stays cheap regardless of how much the
// app gets played. See roundsWon on `users`, maintained incrementally in
// persistSettlement above rather than aggregated from round_history here.
export async function getLeaderboard(by: "net" | "rounds", limit = 25) {
  // A raw computed expression isn't a real numeric-mode column, so drizzle
  // won't auto-parse postgres's string representation of it — mapWith(Number)
  // does that conversion explicitly instead of silently returning "40.00".
  const net = sql<number>`${users.chipsWon} - ${users.chipsLost}`.mapWith(Number);

  return db
    .select({
      username: users.username,
      net,
      roundsWon: users.roundsWon,
    })
    .from(users)
    .orderBy(by === "rounds" ? desc(users.roundsWon) : desc(net))
    .limit(limit);
}
