import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type { IStorage } from "./storage/types";

export async function sessionSecretFor(rooms: IStorage, configured = process.env.SESSION_SECRET): Promise<string> {
  if (configured && configured.length >= 32) return configured;
  if (configured) console.warn("SESSION_SECRET is shorter than 32 characters; using the storage-backed signing key");
  return rooms.getSessionSecret();
}

export function guestSessions(secret: string) {
  // shortcut: cookies identify a browser, require verified sign-in before competitive play.
  const sign = (id: string) => createHmac("sha256", secret).update(id).digest("hex");
  function read(cookie?: string): string | undefined {
    const token = cookie?.match(/(?:^|;\s*)pof_guest=([a-f0-9-]{36})\.([a-f0-9]{64})(?:;|$)/);
    if (!token) return undefined;
    return timingSafeEqual(Buffer.from(sign(token[1]), "hex"), Buffer.from(token[2], "hex")) ? token[1] : undefined;
  }
  return { read, resolve(cookie: string | undefined, res: Response): string {
    const existing = read(cookie);
    if (existing) return existing;
    const id = randomUUID();
    res.cookie("pof_guest", `${id}.${sign(id)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 30 * 24 * 60 * 60 * 1000, path: "/" });
    return id;
  } };
}
