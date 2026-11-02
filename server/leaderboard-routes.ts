import type { Express, Request, Response } from "express";
import { getLeaderboard } from "./stats";

export function registerLeaderboardRoutes(app: Express): void {
  const handler = (by: "net" | "rounds") => async (_req: Request, res: Response) => {
    try {
      const leaderboard = await getLeaderboard(by);
      res.json({ success: true, leaderboard });
    } catch (error) {
      console.error("Leaderboard route error:", error);
      res.status(503).json({ success: false, error: "Leaderboard is temporarily unavailable" });
    }
  };

  app.get("/api/leaderboard/net", handler("net"));
  app.get("/api/leaderboard/rounds", handler("rounds"));
}
