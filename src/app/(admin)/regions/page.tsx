import { setCityRegion } from "@/app/actions";
import { ActionForm } from "@/app/ui/action-form";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { usd } from "@/lib/format";
import { REGIONS } from "@/lib/regions";

export default async function RegionsPage() {
  await requireAdmin();
  const cities = await query<{ city: string | null; region: string; mapped: boolean; accounts: string; revenue_12m: string }>(
    "select * from city_summary order by mapped, revenue_12m desc, city",
  );

  return (
    <>
      <h1>Cities and regions</h1>
      <p>
        Each account&apos;s region comes from its city. Unmapped cities count as Other and are listed first, by
        trailing-12-month revenue.
      </p>
      <table>
        <thead>
          <tr>
            <th>City</th>
            <th className="num">Accounts</th>
            <th className="num">12-month revenue</th>
            <th>Region</th>
          </tr>
        </thead>
        <tbody>
          {cities.map((c) => (
            <tr key={c.city ?? ""}>
              <td>{c.city ?? <span className="muted">No city</span>}</td>
              <td className="num">{c.accounts}</td>
              <td className="num">{usd(c.revenue_12m)}</td>
              <td>
                {c.city ? (
                  <ActionForm action={setCityRegion} submitLabel="Save">
                    <input type="hidden" name="city" value={c.city} />
                    <select name="region" defaultValue={c.region} aria-label="Region">
                      {REGIONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                    {!c.mapped && <span className="muted">unmapped</span>}
                  </ActionForm>
                ) : (
                  "Other"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
