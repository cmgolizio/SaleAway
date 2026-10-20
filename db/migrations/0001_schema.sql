-- Phase 0 schema: the 13 tables from the build spec plus admin_users.

-- Matching key for customer names: lowercase, drop apostrophes, turn other
-- punctuation into spaces, drop LLC/Inc, collapse spaces.
create function norm_name(s text) returns text
language sql immutable parallel safe
return btrim(regexp_replace(
  regexp_replace(
    regexp_replace(regexp_replace(lower(s), '[''’`]', '', 'g'), '[^[:alnum:]]+', ' ', 'g'),
    '\m(llc|inc)\M', ' ', 'g'),
  '\s+', ' ', 'g'));

create domain region_name as text
  check (value in ('New Orleans', 'Metairie', 'Kenner', 'Northshore', 'Baton Rouge', 'Lafayette', 'Other'));

create table import_batches (
  id          bigint generated always as identity primary key,
  filename    text not null,
  date_from   date not null,
  date_to     date not null,
  row_count   integer not null,
  uploaded_at timestamptz not null default now()
);

create table accounts (
  id             bigint generated always as identity primary key,
  canonical_name text not null,
  cust_type      text,
  city           text,
  region         region_name not null default 'Other',
  active         boolean not null default true
);
-- One account per matching key; auto-matching relies on this.
create unique index accounts_name_key on accounts (norm_name(canonical_name));

create table sales (
  id             bigint generated always as identity primary key,
  batch_id       bigint not null references import_batches (id),
  invoice_date   date not null,
  invoice_type   text not null,
  invoice_number text not null,
  raw_customer   text,
  account_id     bigint references accounts (id),
  cust_type      text,
  sales_person   text,
  sku            text,
  vintage        text,
  supplier       text,
  producer       text not null,
  selection      text not null,
  volume         text,
  quantity       numeric not null,
  item_price     numeric not null,
  total_price    numeric not null,
  item_key       text generated always as (producer || ' | ' || selection) stored
);
create index sales_account_item_date on sales (account_id, item_key, invoice_date);
create index sales_invoice_date on sales (invoice_date);
create index sales_raw_customer on sales (raw_customer);

create table account_aliases (
  raw_name   text primary key,
  account_id bigint not null references accounts (id)
);

create table unmatched_names (
  raw_name    text primary key,
  first_seen  date not null,
  revenue_12m numeric not null default 0
);

create table contacts (
  dba_name text not null,
  city     text
);

create table city_regions (
  city   text primary key,
  region region_name not null
);
create unique index city_regions_lower on city_regions (lower(city));

create table reps (
  id     bigint generated always as identity primary key,
  name   text not null unique,
  email  text,
  active boolean not null default true,
  pilot  boolean not null default false
);

create table account_reps (
  account_id bigint primary key references accounts (id),
  rep_id     bigint not null references reps (id),
  source     text not null check (source in ('auto', 'override'))
);

create table settings (
  key   text primary key,
  value numeric not null
);

create table recommendations (
  id         bigint generated always as identity primary key,
  week_start date not null,
  rep_id     bigint not null references reps (id),
  account_id bigint not null references accounts (id),
  kind       text not null,
  item_key   text,
  value_usd  numeric not null,
  peer_share numeric,
  peer_count integer,
  token      text not null unique,
  unique nulls not distinct (week_start, account_id, kind, item_key)
);

create table recommendation_feedback (
  recommendation_id bigint not null references recommendations (id),
  action            text not null check (action in ('done', 'not_a_fit')),
  at                timestamptz not null default now()
);

create table suppressions (
  account_id bigint not null references accounts (id),
  item_key   text not null,
  until      date not null,
  primary key (account_id, item_key)
);

create table admin_users (
  email         text primary key check (email = lower(email)),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

insert into settings (key, value) values
  ('overdue_multiple', 2.0),
  ('min_orders', 4),
  ('min_days_since', 30),
  ('decline_pct', 0.40),
  ('min_prior_t90_usd', 500),
  ('peer_share', 0.25),
  ('min_peer_group', 8),
  ('ws_per_account', 3),
  ('list_cap', 10),
  ('outcome_days', 60),
  ('suppress_days', 180);

-- House account for chain stores; inactive so it never gets a weekly list.
insert into reps (name, active) values ('Corporate', false);

-- Draft mapping, editable on the Regions page. Unlisted cities fall into Other.
insert into city_regions (city, region) values
  ('New Orleans', 'New Orleans'),
  ('Metairie', 'Metairie'),
  ('Kenner', 'Kenner'),
  ('Baton Rouge', 'Baton Rouge'),
  ('Lafayette', 'Lafayette'),
  ('Covington', 'Northshore'),
  ('Mandeville', 'Northshore'),
  ('Slidell', 'Northshore'),
  ('Madisonville', 'Northshore'),
  ('Abita Springs', 'Northshore'),
  ('Lacombe', 'Northshore'),
  ('Folsom', 'Northshore'),
  ('Pearl River', 'Northshore'),
  ('Hammond', 'Northshore'),
  ('Ponchatoula', 'Northshore');
