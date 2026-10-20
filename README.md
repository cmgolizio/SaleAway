# Account Growth Engine

Internal app that turns the sales export into weekly action lists per rep. This is **Phase 0: data foundation**:
loading the sales and Company Contacts exports, matching Customer names to accounts, mapping cities to regions,
and assigning each account a rep.

Everything runs on one company machine: the app and its Postgres database run in Docker, and sales data never
leaves that machine.

## Set up on the company machine

Needs Docker with Docker Compose.

```bash
git clone https://github.com/cmgolizio/SaleAway.git && cd SaleAway
cp .env.example .env
```

Edit `.env` and set:

- `POSTGRES_PASSWORD`: run `openssl rand -hex 24` and paste the result.
- `SESSION_SECRET`: run `openssl rand -base64 32` and paste the result.

Then start it and create your login:

```bash
docker compose up -d --build
docker compose exec app node scripts/create-admin.mjs you@artisanfinewines.com
```

The second command prints a password. Open `http://<machine-name>:3000` and log in. Run the same command again to
reset a password. Only `@artisanfinewines.com` emails can be admins.

To update after pulling new code: `git pull && docker compose up -d --build`. New database migrations apply
automatically when the app starts.

## Using it

1. **Upload sales and samples.** Export any date range of the sales export or the samples export and upload it
   on the same page. A file replaces every row of its own kind between its first and last Invoice Date, in one
   transaction: a sales export replaces sales and credits, a samples export replaces samples. Overlapping or
   repeated uploads are safe.
2. **Upload contacts.** Upload the Company Contacts export (needs DBA Name and City or Ship City columns). It
   replaces the previous contacts.
3. **Review names.** Customer names that don't match a contact's DBA Name are listed by trailing-12-month revenue.
   Link each to an account or contact, or create an account.
4. **Regions.** Map each city to a region. Unmapped cities count as Other.
5. **Accounts.** Every account starts with a rep: its most frequent Sales Person over the last 12 months. Override
   it here; overrides survive later uploads.

## How matching works

- A Customer name's matching key is the name lowercased, with apostrophes removed, other punctuation turned into
  spaces, LLC and Inc dropped, and spaces collapsed. `Smith's Wine Bar, LLC` becomes `smiths wine bar`.
- Accounts come from Company Contacts. A Customer name whose key equals a contact DBA Name's key becomes (or joins)
  that account automatically. Anything else waits in the review queue; nothing is merged on a guess.
- Contacts are the source of truth for city. When a DBA Name appears more than once, its most common city wins.
- Revenue is the sum of Total Price over `Invoice` and `Credit Invoice` rows. `Sample Invoice` and
  `Sample Credit Invoice` rows are stored but never count as revenue, and samples with no Customer are kept
  without an account.
- "Corporate" is an inactive house rep, so chain accounts sold under Corporate get no weekly list until someone
  overrides them to a real rep.
- All windows count back from the latest sale or credit Invoice Date loaded, not today. Samples don't move it.
- Default regions: the six region cities, Northshore towns (St. Tammany and Tangipahoa), and the inner suburbs of
  Baton Rouge and Lafayette. Everything else is Other until mapped on the Regions page.

## Checking the data

```bash
docker compose exec -T db psql -U saleaway saleaway < verify/phase0.sql
python3 verify/monthly_pivot.py Sales_Master.csv
```

`verify/phase0.sql` prints the Phase 0 acceptance checks: row count, a fingerprint to compare before and after a
re-upload, monthly net revenue, revenue coverage by account and region, and accounts without a rep.
`verify/monthly_pivot.py` computes monthly net revenue straight from the CSV, independently of the app, to compare
with check 3 or with an Excel pivot.

## Operations

- **Backups:** the data lives in the `pgdata` Docker volume. Back it up with
  `docker compose exec -T db pg_dump -U saleaway saleaway > backup.sql`.
- **Network:** the database has no published port; only the app container can reach it. The app listens on port
  3000 over plain HTTP, which is fine on the office network. If it is ever reachable from outside, put it behind
  HTTPS and set `COOKIE_SECURE=true`.

## Local development

Needs Node 22 and a Postgres 16 database.

```bash
npm install
cp .env.example .env   # point DATABASE_URL at your database, set SESSION_SECRET
npm run migrate
npm run create-admin -- you@artisanfinewines.com
npm run dev
```

Schema and SQL live in `db/migrations`; aggregation lives in SQL views and functions, not TypeScript. All metric
thresholds are in the `settings` table.

## Changes from the build spec

Leadership ruled out keeping sales data in Supabase, so the stack moved to self-hosted Docker:

| Spec                          | Now                                                                 |
| ----------------------------- | ------------------------------------------------------------------- |
| Supabase Postgres             | Postgres 16 in Docker on a company machine                          |
| Vercel hosting                | Next.js in Docker on the same machine                               |
| Supabase Auth magic link      | Email and password, stored hashed in an `admin_users` table (14th table) |
| Row-level security            | Login checked by the app on every page and action; database not exposed |
| Vercel Cron, Resend           | Not needed until Phase 2; to be decided                             |

Other Phase 0 decisions: accounts are created from Company Contacts; "Corporate" is an inactive house rep; an
account with no sales in the last 12 months gets its rep from all loaded history instead. Samples come in their
own export rather than the sales file, so each upload replaces only its own kind of row, and the as-of date
ignores samples.
