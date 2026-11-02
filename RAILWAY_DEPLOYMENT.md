# Railway Hobby Deployment

Furious5 should deploy as one Node web service plus one Redis service and one
PostgreSQL service. Do not enable multiple app replicas until room fanout is
moved to Redis Pub/Sub or a Socket.IO Redis adapter style setup. The current
WebSocket connection map is intentionally in process.

## Project Setup

1. Create a Railway project from the GitHub repo.
2. Let Railway build the app from the root `Dockerfile`.
3. Do not set custom Railway build or start commands unless you intentionally stop using Docker.
4. Set replicas to `1`.
5. Add a Redis database service in the same Railway project.
6. Add a PostgreSQL database service in the same Railway project.
7. Keep Redis and PostgreSQL private to the project unless temporary debugging requires otherwise.

The Dockerfile runs `npm ci`, `npm run build`, prunes development dependencies, and starts `node dist/index.js`. Railway should only need the Dockerfile plus the environment variables below.

## Environment Variables

Set these on the Node app service:

```text
NODE_ENV=production
CORS_ORIGIN=https://your-app.up.railway.app
ROOM_TTL_SECONDS=14400
REDIS_URL=${{Redis.REDIS_URL}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

After adding a custom domain, replace `CORS_ORIGIN` with the custom HTTPS origin. Do not leave `CORS_ORIGIN=*` for production.

## Fresh database setup

This migration intentionally starts with an empty database. After adding the
Railway PostgreSQL service and linking `DATABASE_URL` above, apply the schema
once:

```bash
DATABASE_URL=<railway-postgres-connection-string> npm run db:push
```

Run this from a shell that can reach the Railway database. If you run it from
your laptop, temporarily use the database's public connection string, then
remove public access afterward. Never run it against the old Supabase database
when starting fresh.

To add synthetic activity after the schema exists, use the same Railway
connection and explicit confirmation:

```powershell
$env:DATABASE_URL = "<railway-postgres-connection-string>"
$env:SEED_CONFIRM = "FURIOUS5_SEED_RAILWAY"
npm run db:seed
Remove-Item Env:DATABASE_URL
Remove-Item Env:SEED_CONFIRM
```

This adds 24 `seed_` users and 512 four-player rounds. It refuses Supabase
URLs and refuses to run again if those seed users already exist.

## Smoke Checks

After deployment, verify the app and Redis state backend:

```bash
curl https://your-app.up.railway.app/health
curl https://your-app.up.railway.app/api/leaderboard/net
curl https://your-app.up.railway.app/api/leaderboard/rounds
```

Expected fields include:

```json
{
  "status": "healthy",
  "redis": "connected",
  "activeRooms": 0,
  "activeSockets": 0
}
```

The leaderboard endpoints should return HTTP 200 with `success: true` (an
empty `leaderboard` is valid for a new database).

Enable Railway Postgres volume backups and keep a periodic `pg_dump` outside
the project. Railway's Postgres template uses a persistent volume, but backup
and restore drills remain an application-owner responsibility.

Then confirm the WebSocket endpoint is reachable:

```text
wss://your-app.up.railway.app/ws
```

## Load Test

Run the default 100-client profile:

```bash
WS_URL=wss://your-app.up.railway.app/ws npm run load:ws
```

Useful overrides:

```bash
npm run load:ws -- --url=wss://your-app.up.railway.app/ws --rooms=20 --players=5 --durationMs=1200000
```

Pass criteria:

- The app does not crash.
- `/health` continues to report Redis as connected.
- Error and disconnect counts stay low.
- p95 action-to-state-update latency is roughly under 300-500 ms.
- Memory remains within Railway Hobby practical limits.

## Restart Recovery Checklist

1. Create a room.
2. Join 3-5 players.
3. Ready all players and start the game.
4. Redeploy or restart the app service.
5. Reconnect with the saved `roomCode` and `playerId`.
6. Confirm `game:getState` returns the room from Redis and marks the player connected.

If this passes, the app is ready for a single-replica Railway Hobby production launch.
