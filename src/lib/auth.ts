import crypto from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";

const COOKIE = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set.");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

// Stored as scrypt$<salt>$<hash>, base64; scripts/create-admin.mjs writes the same format.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export async function createSession(email: string): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + MAX_AGE_SECONDS * 1000 })).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

async function sessionEmail(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const [payload, mac] = value.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { email: string; exp: number };
  return exp > Date.now() ? email : null;
}

// Call at the top of every admin page and Server Action.
export async function requireAdmin(): Promise<string> {
  const email = await sessionEmail();
  if (email) {
    const rows = await query("select 1 from admin_users where email = $1", [email]);
    if (rows.length) return email;
  }
  redirect("/login");
}
