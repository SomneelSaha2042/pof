import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. Accounts, login, and game history are unavailable; guest play is unaffected.",
  );
}

// postgres-js connects lazily, so this is safe to construct even with an
// empty connection string — queries will fail (and be caught) only if
// something actually tries to use accounts while unconfigured.
const client = postgres(connectionString ?? "", {
  ssl: "require",
  max: 10,
  // DATABASE_URL may point at a transaction pooler, where prepared statements
  // are not safe when successive queries land on different backend sessions.
  // Disabling them keeps the connection portable across local and hosted DBs.
  prepare: false,
});

export const db = drizzle(client, { schema });
