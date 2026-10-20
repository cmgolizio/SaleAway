import { overrideRep } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { usd } from "@/lib/format";

export default async function AccountsPage() {
  await requireAdmin();
  const [accounts, reps] = await Promise.all([
    query<{
      id: string;
      canonical_name: string;
      cust_type: string | null;
      city: string | null;
      region: string;
      rep: string | null;
      rep_source: string | null;
      revenue_12m: string;
    }>("select * from account_summary order by revenue_12m desc, canonical_name"),
    query<{ id: string; name: string; active: boolean }>("select id, name, active from reps order by name"),
  ]);

  return (
    <>
      <h1>Accounts ({accounts.length.toLocaleString()})</h1>
      <p>
        Each account&apos;s rep starts as its most frequent Sales Person over the last 12 months. Override it here; an
        override is never replaced by a later upload.
      </p>
      <datalist id="accounts">
        {accounts.map((a) => (
          <option key={a.id} value={a.canonical_name} />
        ))}
      </datalist>
      <ActionForm action={overrideRep} submitLabel="Assign">
        <input name="account" list="accounts" placeholder="Account" aria-label="Account" size={36} required />
        <select name="rep" aria-label="Rep" required defaultValue="">
          <option value="" disabled>
            Rep
          </option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </ActionForm>
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Cust Type</th>
            <th>City</th>
            <th>Region</th>
            <th>Rep</th>
            <th className="num">12-month revenue</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.canonical_name}</td>
              <td>{a.cust_type}</td>
              <td>{a.city}</td>
              <td>{a.region}</td>
              <td>
                {a.rep}
                {a.rep_source === "override" && <span className="muted"> (override)</span>}
              </td>
              <td className="num">{usd(a.revenue_12m)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
