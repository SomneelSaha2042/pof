import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import {
  hashPassword,
  verifyPassword,
  createSession,
  getUserForSessionToken,
  destroySessionToken,
  sessionCookieOptions,
  normalizeEmail,
  normalizeUsername,
  SESSION_COOKIE_NAME,
} from "./auth";
import { parseCookieHeader } from "./cookies";
import { getRecentRounds } from "./stats";

const SignupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const LoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many attempts. Please try again later.",
});

function getSessionToken(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME];
}

function withErrorHandling(
  handler: (req: Request, res: Response) => Promise<unknown>,
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Auth route error:", error);
      res.status(503).json({ success: false, error: "Accounts are temporarily unavailable" });
    }
  };
}

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/signup", authLimiter, withErrorHandling(async (req: Request, res: Response) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }

    const { username, email, password } = parsed.data;
    const usernameLower = normalizeUsername(username);
    const emailLower = normalizeEmail(email);

    const existing = await db
      .select({ usernameLower: users.usernameLower, emailLower: users.emailLower })
      .from(users)
      .where(or(eq(users.usernameLower, usernameLower), eq(users.emailLower, emailLower)));

    if (existing.some((row) => row.usernameLower === usernameLower)) {
      return res.status(409).json({ success: false, error: "That username is taken" });
    }
    if (existing.some((row) => row.emailLower === emailLower)) {
      return res.status(409).json({ success: false, error: "Unable to create account with these details" });
    }

    const passwordHash = await hashPassword(password);

    let userId: string;
    try {
      const [created] = await db
        .insert(users)
        .values({ username, usernameLower, email, emailLower, passwordHash })
        .returning({ id: users.id });
      userId = created.id;
    } catch {
      return res.status(409).json({ success: false, error: "Unable to create account with these details" });
    }

    const token = await createSession(userId);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.json({ success: true, username });
  }));

  app.post("/api/auth/login", authLimiter, withErrorHandling(async (req: Request, res: Response) => {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid email or password" });
    }

    const emailLower = normalizeEmail(parsed.data.email);
    const [user] = await db.select().from(users).where(eq(users.emailLower, emailLower)).limit(1);

    const genericError = { success: false, error: "Invalid email or password" };
    if (!user) {
      return res.status(401).json(genericError);
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json(genericError);
    }

    const token = await createSession(user.id);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    res.json({ success: true, username: user.username });
  }));

  app.post("/api/auth/logout", withErrorHandling(async (req: Request, res: Response) => {
    const token = getSessionToken(req);
    if (token) {
      await destroySessionToken(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.json({ success: true });
  }));

  app.get("/api/auth/me", withErrorHandling(async (req: Request, res: Response) => {
    const user = await getUserForSessionToken(getSessionToken(req));
    if (!user) {
      return res.status(401).json({ success: false, error: "Not signed in" });
    }
    res.json({ success: true, username: user.username });
  }));

  app.get("/api/me/stats", withErrorHandling(async (req: Request, res: Response) => {
    const user = await getUserForSessionToken(getSessionToken(req));
    if (!user) {
      return res.status(401).json({ success: false, error: "Not signed in" });
    }
    res.json({
      success: true,
      chipsWon: user.chipsWon,
      chipsLost: user.chipsLost,
      net: user.chipsWon - user.chipsLost,
    });
  }));

  app.get("/api/me/history", withErrorHandling(async (req: Request, res: Response) => {
    const user = await getUserForSessionToken(getSessionToken(req));
    if (!user) {
      return res.status(401).json({ success: false, error: "Not signed in" });
    }
    const rounds = await getRecentRounds(user.id, 5);
    res.json({ success: true, rounds });
  }));
}
