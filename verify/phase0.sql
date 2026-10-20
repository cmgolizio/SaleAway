-- Phase 0 acceptance checks.
-- Run: psql "$DATABASE_URL" -f verify/phase0.sql
-- With Docker: docker compose exec -T db psql -U saleaway saleaway < verify/phase0.sql

\echo '1. Sales rows (must equal the CSV data rows, i.e. lines minus the header)'
select count(*) as sales_rows from sales;

\echo '2. Fingerprint (run before and after re-uploading the same file; nothing may change)'
select count(*) as rows, sum(total_price) as total_price, sum(quantity) as quantity, md5(string_agg(line, E'\n' order by line collate "C")) as content_hash
from (
  select total_price, quantity,
         concat_ws('|', invoice_date, invoice_type, invoice_number, raw_customer, cust_type, sales_person, sku, vintage,
                   supplier, producer, selection, volume, quantity, item_price, total_price) as line
  from sales
) s;

\echo '3. Monthly net revenue, Invoice + Credit Invoice (compare with an Excel pivot or verify/monthly_pivot.py)'
select month, round(net_revenue, 2) as net_revenue from monthly_revenue;

\echo '4. Trailing-12-month revenue coverage (targets: 98% to an account, 95% to a region other than Other)'
select revenue_12m,
       round(100 * to_account / revenue_12m, 2) as pct_to_account,
       round(100 * to_region / revenue_12m, 2) as pct_to_region
from coverage_12m;

\echo '   Top of the review queue, by trailing-12-month revenue'
select raw_name, revenue_12m from unmatched_names order by revenue_12m desc limit 10;

\echo '5. Active accounts without exactly one rep (must be 0)'
select count(*) as violations
from accounts a
where a.active and (select count(*) from account_reps ar where ar.account_id = a.id) <> 1;
