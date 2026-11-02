import { pgTable, uuid, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  usernameLower: text("username_lower").notNull().unique(),
  email: text("email").notNull().unique(),
  emailLower: text("email_lower").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  chipsWon: numeric("chips_won", { mode: "number", precision: 14, scale: 2 }).notNull().default(0),
  chipsLost: numeric("chips_lost", { mode: "number", precision: 14, scale: 2 }).notNull().default(0),
  roundsWon: integer("rounds_won").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roundHistory = pgTable(
  "round_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomCode: text("room_code").notNull(),
    roundNumber: integer("round_number").notNull(),
    payout: numeric("payout", { mode: "number", precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdCreatedAtIdx: index("round_history_user_id_created_at_idx").on(table.userId, table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type RoundHistory = typeof roundHistory.$inferSelect;
