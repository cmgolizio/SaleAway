import { createAccountForName, linkName } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { usd } from "@/lib/format";

export default async function ReviewPage() {
  await requireAdmin();
  const [names, targets] = await Promise.all([
    query<{ raw_name: string; first_seen: string; revenue_12m: string }>(
      "select * from unmatched_names order by revenue_12m desc, raw_name",
    ),
    // Existing accounts, plus contacts that don't have an account yet.
    query<{ name: string }>(
      `select canonical_name as name from accounts
       union
       select dba_name from contact_keys ck
       where not exists (select 1 from accounts a where norm_name(a.canonical_name) = ck.name_key)
       order by 1`,
    ),
  ]);

  return (
    <>
      <h1>Unmatched Customer names ({names.length.toLocaleString()})</h1>
      <p>
        These Customer names didn&apos;t match an account or a contact&apos;s DBA Name. Link each to an existing account or
        contact, or create a new account. Sorted by trailing-12-month revenue.
      </p>
      <datalist id="targets">
        {targets.map((t) => (
          <option key={t.name} value={t.name} />
        ))}
      </datalist>
      <table>
        <thead>
          <tr>
            <th>Customer name</th>
            <th>First invoice</th>
            <th className="num">12-month revenue</th>
            <th>Link to account or contact</th>
            <th>Or create an account</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n) => (
            <tr key={n.raw_name}>
              <td>{n.raw_name}</td>
              <td>{n.first_seen}</td>
              <td className="num">{usd(n.revenue_12m)}</td>
              <td>
                <ActionForm action={linkName} submitLabel="Link">
                  <input type="hidden" name="raw" value={n.raw_name} />
                  <input name="target" list="targets" placeholder="Start typing a name" aria-label="Account or contact" />
                </ActionForm>
              </td>
              <td>
                <ActionForm action={createAccountForName} submitLabel="Create">
                  <input type="hidden" name="raw" value={n.raw_name} />
                  <input name="city" placeholder="City" aria-label="City" size={12} />
                </ActionForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
