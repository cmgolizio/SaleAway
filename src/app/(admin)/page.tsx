import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { pct, usd } from "@/lib/format";

export default async function StatusPage() {
  await requireAdmin();
  const [[stats], [coverage], batches] = await Promise.all([
    query<{ as_of: string | null; sales_rows: string; accounts: string; unmatched: string; without_rep: string }>(
      `select as_of_date() as as_of,
              (select count(*) from sales) as sales_rows,
              (select count(*) from accounts) as accounts,
              (select count(*) from unmatched_names) as unmatched,
              (select count(*) from accounts a
                where a.active and not exists (select 1 from account_reps ar where ar.account_id = a.id)) as without_rep`,
    ),
    query<{ revenue_12m: string | null; to_account: string; to_region: string }>("select * from coverage_12m"),
    query<{ id: string; filename: string; date_from: string; date_to: string; row_count: number; uploaded_at: Date }>(
      "select * from import_batches order by id desc limit 10",
    ),
  ]);

  return (
    <>
      <h1>Status</h1>
      <dl className="stats">
        <dt>As-of date</dt>
        <dd>{stats.as_of ?? "No sales loaded"}</dd>
        <dt>Sales rows</dt>
        <dd>{Number(stats.sales_rows).toLocaleString()}</dd>
        <dt>Trailing-12-month revenue</dt>
        <dd>{usd(coverage.revenue_12m)}</dd>
        <dt>…mapped to an account</dt>
        <dd>{pct(coverage.to_account, coverage.revenue_12m ?? 0)} (target 98%)</dd>
        <dt>…mapped to a region</dt>
        <dd>{pct(coverage.to_region, coverage.revenue_12m ?? 0)} (target 95%)</dd>
        <dt>Accounts</dt>
        <dd>{Number(stats.accounts).toLocaleString()}</dd>
        <dt>Active accounts without a rep</dt>
        <dd>{stats.without_rep}</dd>
        <dt>Names waiting for review</dt>
        <dd>
          <Link href="/review">{Number(stats.unmatched).toLocaleString()}</Link>
        </dd>
      </dl>

      <h2>Recent uploads</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Date range</th>
            <th className="num">Rows</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id}>
              <td>{b.filename}</td>
              <td>
                {b.date_from} to {b.date_to}
              </td>
              <td className="num">{b.row_count.toLocaleString()}</td>
              <td>{b.uploaded_at.toLocaleString("en-US", { timeZone: "America/Chicago" })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
