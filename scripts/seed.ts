import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { roundHistory, users } from "../shared/schema";

const USERNAMES = [
  "pixelatedpanda",
  "midnightlurker",
  "chaos_in_casual",
  "not_a_bot_404",
  "lowkeylegend",
  "replyguy_prime",
  "throwawayace",
  "cloudy_chance",
  "maincharvibes",
  "zero_context",
  "keyboardgremlin",
  "probablyoffline",
  "unpaidintern",
  "hot_take_harbor",
  "daily_yap",
  "ctrl_delight",
  "just_here_memes",
  "sidequest",
  "chronically_on",
  "plot_twist",
  "touch_grass",
  "based_baffled",
  "lore_dropper",
  "vibes_based",
] as const;

const ROUND_COUNT = 512;
const PLAYERS_PER_ROUND = 4;
const SEED_CONFIRM = "FURIOUS5_SEED_RAILWAY";
const SEED_PREFIX = "seed_";
const ROOM_PREFIX = "FF-SEED-";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Totals = {
  chipsWon: number;
  chipsLost: number;
  roundsWon: number;
};

function validateTarget(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (/supabase/i.test(databaseUrl)) {
    throw new Error("Refusing to seed a Supabase DATABASE_URL; target Railway Postgres explicitly");
  }
  if (process.env.SEED_CONFIRM !== SEED_CONFIRM) {
    throw new Error(`Set SEED_CONFIRM=${SEED_CONFIRM} before running the seed`);
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const databaseUrl = validateTarget();
  const { hashPassword } = await import("../server/auth");
  const client = postgres(databaseUrl, {
    ssl: "require",
    max: 4,
    prepare: false,
  });
  const db = drizzle(client, { schema: { users, roundHistory } });

  try {
    if (USERNAMES.length !== 24) {
      throw new Error("Seed user list must contain exactly 24 users");
    }

    const totals: Totals[] = USERNAMES.map(() => ({
      chipsWon: 0,
      chipsLost: 0,
      roundsWon: 0,
    }));
    const roundRows: Array<{
      userIndex: number;
      roomCode: string;
      roundNumber: number;
      payout: number;
      createdAt: Date;
    }> = [];
    const now = Date.now();

    for (let roundIndex = 0; roundIndex < ROUND_COUNT; roundIndex += 1) {
      const roundNumber = roundIndex + 1;
      const playerIndexes = Array.from(
        { length: PLAYERS_PER_ROUND },
        (_, seat) => (roundIndex * 5 + seat * 7) % USERNAMES.length,
      );
      const winnerSeat = (roundIndex * 3) % PLAYERS_PER_ROUND;
      const winnerPayout = 90 + ((roundIndex * 17) % 100) * 3;
      const loserPayout = winnerPayout / (PLAYERS_PER_ROUND - 1);
      const createdAt = new Date(now - (ROUND_COUNT - roundNumber) * HOUR_MS);

      playerIndexes.forEach((userIndex, seat) => {
        const payout = seat === winnerSeat ? winnerPayout : -loserPayout;
        roundRows.push({
          userIndex,
          roomCode: `${ROOM_PREFIX}${String(roundNumber).padStart(4, "0")}`,
          roundNumber,
          payout,
          createdAt,
        });

        if (payout > 0) {
          totals[userIndex].chipsWon += payout;
          totals[userIndex].roundsWon += 1;
        } else {
          totals[userIndex].chipsLost += -payout;
        }
      });
    }

    if (roundRows.length !== ROUND_COUNT * PLAYERS_PER_ROUND) {
      throw new Error("Seed round count assertion failed");
    }
    if (totals.reduce((sum, total) => sum + total.chipsWon - total.chipsLost, 0) !== 0) {
      throw new Error("Seed payout balance assertion failed");
    }

    const passwordHashes = await Promise.all(USERNAMES.map(() => hashPassword(randomUUID())));
    const seededUsernames = USERNAMES.map((name) => `${SEED_PREFIX}${name}`);
    const userRows = USERNAMES.map((name, index) => ({
      username: seededUsernames[index],
      usernameLower: seededUsernames[index],
      email: `seed.${name}@furious5.example`,
      emailLower: `seed.${name}@furious5.example`,
      passwordHash: passwordHashes[index],
      chipsWon: totals[index].chipsWon,
      chipsLost: totals[index].chipsLost,
      roundsWon: totals[index].roundsWon,
      createdAt: new Date(now - (USERNAMES.length - index) * 3 * DAY_MS),
    }));

    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ usernameLower: users.usernameLower })
        .from(users)
        .where(sql`left(${users.usernameLower}, ${SEED_PREFIX.length}) = ${SEED_PREFIX}`);

      if (existing.length > 0) {
        throw new Error("Seed users already exist; refusing to create duplicate activity");
      }

      const insertedUsers = await tx
        .insert(users)
        .values(userRows)
        .returning({ id: users.id, usernameLower: users.usernameLower });
      const userIds = new Map(insertedUsers.map((user) => [user.usernameLower, user.id]));

      await tx.insert(roundHistory).values(
        roundRows.map(({ userIndex, ...row }) => {
          const userId = userIds.get(seededUsernames[userIndex]);
          if (!userId) {
            throw new Error("Seed user lookup failed");
          }
          return { userId, ...row };
        }),
      );
    });

    console.log(`Seeded ${USERNAMES.length} users and ${ROUND_COUNT} rounds (${roundRows.length} history entries)`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

await main();
