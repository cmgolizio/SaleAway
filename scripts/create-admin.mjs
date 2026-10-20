// Creates an admin, or resets an existing admin's password, and prints the new password.
// Usage: node scripts/create-admin.mjs someone@artisanfinewines.com
import crypto from "node:crypto";
import pg from "pg";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const domain = process.env.ADMIN_EMAIL_DOMAIN;
if (!domain) throw new Error("ADMIN_EMAIL_DOMAIN is not set.");
if (!email.endsWith(`@${domain}`)) throw new Error(`Admins must have an @${domain} email.`);

// Same format src/lib/auth.ts verifies: scrypt$<salt>$<hash>, base64.
const password = crypto.randomBytes(12).toString("base64url");
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
const stored = `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    `insert into admin_users (email, password_hash) values ($1, $2)
     on conflict (email) do update set password_hash = excluded.password_hash`,
    [email, stored],
  );
} finally {
  await client.end();
}
console.log(`Admin ${email} password: ${password}`);
