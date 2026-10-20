-- Samples arrive in their own export, with the same columns as the sales export.

-- The as-of date follows sales and credits only, so a samples upload can't move
-- every window forward past the last sales data loaded.
create or replace function as_of_date() returns date
language sql stable
return (select max(invoice_date) from sales where is_revenue_type(invoice_type));

-- Same as 0002, except a file only replaces rows of the kinds it contains:
-- a sales export replaces sales and credits in its range, a samples export
-- replaces samples in its range, and a combined file replaces both.
create or replace function import_sales(p_filename text, p_rows json) returns json
language plpgsql as $$
declare
  v_from date;
  v_to date;
  v_count integer;
  v_has_sales boolean;
  v_has_samples boolean;
  v_batch bigint;
  v_deleted bigint;
begin
  perform pg_advisory_xact_lock(hashtext('import_sales'));

  select min((r ->> 0)::date), max((r ->> 0)::date), count(*),
         coalesce(bool_or(is_revenue_type(r ->> 1)), false), coalesce(bool_or(not is_revenue_type(r ->> 1)), false)
  into v_from, v_to, v_count, v_has_sales, v_has_samples
  from json_array_elements(p_rows) r;

  if v_count = 0 then
    raise exception 'The file has no data rows.';
  end if;

  delete from sales
  where invoice_date between v_from and v_to
    and ((v_has_sales and is_revenue_type(invoice_type)) or (v_has_samples and not is_revenue_type(invoice_type)));
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
                           'has_sales', v_has_sales, 'has_samples', v_has_samples,
                           'unmatched', (select count(*) from unmatched_names));
end $$;
