-- Loading, account matching and the views Phase 0 is checked against.

-- Sale and credit lines count as revenue; samples do not.
create function is_revenue_type(t text) returns boolean
language sql immutable parallel safe
return t in ('Invoice', 'Credit Invoice');

-- Latest invoice date loaded; every window counts back from here.
create function as_of_date() returns date
language sql stable
return (select max(invoice_date) from sales);

create view revenue_lines as
select * from sales where is_revenue_type(invoice_type);

create view monthly_revenue as
select to_char(invoice_date, 'YYYY-MM') as month, sum(total_price) as net_revenue
from revenue_lines
group by 1
order by 1;

-- One row per matching key; when a name repeats, its most common city wins.
create view contact_keys as
select distinct on (name_key) name_key, dba_name, city
from (
  select norm_name(dba_name) as name_key, dba_name, nullif(btrim(city), '') as city,
         count(*) over (partition by norm_name(dba_name), lower(btrim(city))) as n
  from contacts
) c
order by name_key, n desc, city, dba_name;

create function refresh_matching() returns void
language plpgsql as $$
declare
  v_asof date := as_of_date();
begin
  -- Every Sales Person seen becomes a rep.
  insert into reps (name)
  select distinct sales_person from sales where sales_person is not null
  on conflict (name) do nothing;

  -- Create accounts from contacts that match a not-yet-aliased Customer name.
  insert into accounts (canonical_name, city)
  select ck.dba_name, ck.city
  from contact_keys ck
  where ck.name_key in (
      select norm_name(n.raw_customer)
      from (select distinct raw_customer from sales where raw_customer is not null) n
      where not exists (select 1 from account_aliases x where x.raw_name = n.raw_customer))
    and not exists (select 1 from accounts a where norm_name(a.canonical_name) = ck.name_key);

  -- Alias Customer names whose key matches an account (at most one, by the unique index).
  insert into account_aliases (raw_name, account_id)
  select n.raw_customer, a.id
  from (select distinct raw_customer from sales where raw_customer is not null) n
  join accounts a on norm_name(a.canonical_name) = norm_name(n.raw_customer)
  where not exists (select 1 from account_aliases x where x.raw_name = n.raw_customer);

  update sales s
  set account_id = x.account_id
  from account_aliases x
  where x.raw_name = s.raw_customer and s.account_id is distinct from x.account_id;

  -- Contacts are the source of truth for city; region follows city.
  update accounts a
  set city = ck.city
  from contact_keys ck
  where ck.name_key = norm_name(a.canonical_name) and a.city is distinct from ck.city;

  update accounts a
  set region = r.region
  from (
    select a2.id, coalesce(cr.region, 'Other') as region
    from accounts a2
    left join city_regions cr on lower(cr.city) = lower(btrim(a2.city))
  ) r
  where r.id = a.id and a.region is distinct from r.region;

  update accounts a
  set cust_type = t.cust_type
  from (
    select distinct on (account_id) account_id, cust_type
    from sales
    where account_id is not null and cust_type is not null
    group by account_id, cust_type
    order by account_id, count(*) desc, cust_type
  ) t
  where t.account_id = a.id and a.cust_type is distinct from t.cust_type;

  -- Seed a rep for accounts without one: most invoices over the trailing
  -- 365 days, falling back to all loaded history. Overrides are never touched.
  insert into account_reps (account_id, rep_id, source)
  select distinct on (s.account_id) s.account_id, r.id, 'auto'
  from sales s
  join reps r on r.name = s.sales_person
  where s.account_id is not null
    and not exists (select 1 from account_reps ar where ar.account_id = s.account_id)
  group by s.account_id, r.id, r.name
  order by s.account_id,
           count(distinct s.invoice_number) filter (where s.invoice_date > v_asof - 365) desc,
           count(distinct s.invoice_number) desc,
           r.name;

  delete from unmatched_names;
  insert into unmatched_names (raw_name, first_seen, revenue_12m)
  select raw_customer,
         min(invoice_date),
         coalesce(sum(total_price) filter (where is_revenue_type(invoice_type) and invoice_date > v_asof - 365), 0)
  from sales
  where raw_customer is not null and account_id is null
  group by raw_customer;
end $$;

-- Replace every sales row in the file's date range with the file, in one
-- transaction. p_rows is a JSON array of 15-element arrays in export order,
-- with dates as YYYY-MM-DD and blanks as null.
create function import_sales(p_filename text, p_rows json) returns json
language plpgsql as $$
declare
  v_from date;
  v_to date;
  v_count integer;
  v_batch bigint;
  v_deleted bigint;
begin
  perform pg_advisory_xact_lock(hashtext('import_sales'));

  select min((r ->> 0)::date), max((r ->> 0)::date), count(*)
  into v_from, v_to, v_count
  from json_array_elements(p_rows) r;

  if v_count = 0 then
    raise exception 'The file has no data rows.';
  end if;

  delete from sales where invoice_date between v_from and v_to;
  get diagnostics v_deleted = row_count;

  insert into import_batches (filename, date_from, date_to, row_count)
  values (p_filename, v_from, v_to, v_count)
  returning id into v_batch;

  insert into sales (batch_id, invoice_date, invoice_type, invoice_number, raw_customer, account_id,
                     cust_type, sales_person, sku, vintage, supplier, producer, selection, volume,
                     quantity, item_price, total_price)
  select v_batch, (r ->> 0)::date, r ->> 1, r ->> 2, r ->> 3, x.account_id,
         r ->> 4, r ->> 5, r ->> 6, r ->> 7, r ->> 8, r ->> 9, r ->> 10, r ->> 11,
         (r ->> 12)::numeric, (r ->> 13)::numeric, (r ->> 14)::numeric
  from json_array_elements(p_rows) r
  left join account_aliases x on x.raw_name = r ->> 3;

  perform refresh_matching();

  return json_build_object('date_from', v_from, 'date_to', v_to, 'inserted', v_count, 'deleted', v_deleted,
                           'unmatched', (select count(*) from unmatched_names));
end $$;

-- Replace the contacts snapshot. p_rows is a JSON array of [dba_name, city].
create function import_contacts(p_rows json) returns json
language plpgsql as $$
begin
  delete from contacts;
  insert into contacts (dba_name, city)
  select r ->> 0, r ->> 1 from json_array_elements(p_rows) r;

  perform refresh_matching();

  return json_build_object('contacts', (select count(*) from contacts),
                           'accounts', (select count(*) from accounts),
                           'unmatched', (select count(*) from unmatched_names));
end $$;

create view account_revenue_12m as
select account_id, sum(total_price) as revenue_12m
from revenue_lines
where account_id is not null and invoice_date > as_of_date() - 365
group by account_id;

create view coverage_12m as
select sum(s.total_price) as revenue_12m,
       coalesce(sum(s.total_price) filter (where s.account_id is not null), 0) as to_account,
       coalesce(sum(s.total_price) filter (where a.region <> 'Other'), 0) as to_region
from revenue_lines s
left join accounts a on a.id = s.account_id
where s.invoice_date > as_of_date() - 365;

create view account_summary as
select a.id, a.canonical_name, a.cust_type, a.city, a.region, a.active,
       r.name as rep, ar.source as rep_source, coalesce(ar12.revenue_12m, 0) as revenue_12m
from accounts a
left join account_reps ar on ar.account_id = a.id
left join reps r on r.id = ar.rep_id
left join account_revenue_12m ar12 on ar12.account_id = a.id;

create view city_summary as
select min(a.city) as city, coalesce(cr.region, 'Other') as region, cr.city is not null as mapped,
       count(*) as accounts, coalesce(sum(ar12.revenue_12m), 0) as revenue_12m
from accounts a
left join city_regions cr on lower(cr.city) = lower(btrim(a.city))
left join account_revenue_12m ar12 on ar12.account_id = a.id
group by lower(btrim(a.city)), cr.region, cr.city;

-- Review queue: link a Customer name to an account, creating the account from
-- a contact when no account has that name yet. Returns the account name.
create function link_name(p_raw text, p_target text) returns text
language plpgsql as $$
declare
  v_id bigint;
  v_name text;
begin
  select id, canonical_name into v_id, v_name
  from accounts where norm_name(canonical_name) = norm_name(p_target);

  if v_id is null then
    insert into accounts (canonical_name, city)
    select dba_name, city from contact_keys where name_key = norm_name(p_target)
    returning id, canonical_name into v_id, v_name;
  end if;

  if v_id is null then
    raise exception 'No account or contact is named "%".', p_target;
  end if;

  insert into account_aliases (raw_name, account_id) values (p_raw, v_id)
  on conflict (raw_name) do update set account_id = excluded.account_id;

  perform refresh_matching();
  return v_name;
end $$;

-- Review queue: create a new account named after the Customer name.
create function create_account_for_name(p_raw text, p_city text) returns void
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into accounts (canonical_name, city)
  values (btrim(p_raw), nullif(btrim(p_city), ''))
  returning id into v_id;

  insert into account_aliases (raw_name, account_id) values (p_raw, v_id);

  perform refresh_matching();
end $$;

create function set_city_region(p_city text, p_region region_name) returns void
language plpgsql as $$
begin
  insert into city_regions (city, region) values (btrim(p_city), p_region)
  on conflict ((lower(city))) do update set region = excluded.region;

  perform refresh_matching();
end $$;
