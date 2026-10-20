"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, deleteSession, requireAdmin, verifyPassword } from "@/lib/auth";
import { parseContactsCsv, parseSalesCsv } from "@/lib/csv";
import { query } from "@/lib/db";
import type { ActionResult } from "@/app/ui/action-form";

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function failure(err: unknown): ActionResult {
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return { ok: false, message: "An account with that name already exists. Link to it instead." };
  return { ok: false, message: e.message ?? "Something went wrong." };
}

function errorList(errors: string[]): ActionResult {
  return { ok: false, message: `Nothing was loaded. ${errors.join(" ")}` };
}

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const [user] = await query<{ password_hash: string }>("select password_hash from admin_users where email = $1", [email]);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { ok: false, message: "Wrong email or password." };
  }
  await createSession(email);
  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

export async function uploadSales(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file." };

  const { rows, errors } = parseSalesCsv(await file.text());
  if (errors.length) return errorList(errors);

  try {
    const [{ result }] = await query<{
      result: {
        date_from: string;
        date_to: string;
        inserted: number;
        deleted: number;
        has_sales: boolean;
        has_samples: boolean;
        unmatched: number;
      };
    }>("select import_sales($1, $2::json) as result", [file.name, JSON.stringify(rows)]);
    revalidatePath("/", "layout");
    const kind = [result.has_sales && "sale and credit", result.has_samples && "sample"].filter(Boolean).join(" and ");
    return {
      ok: true,
      message:
        `Loaded ${result.inserted.toLocaleString()} rows for ${result.date_from} to ${result.date_to}, ` +
        `replacing ${result.deleted.toLocaleString()} ${kind} rows already in that range. ` +
        `${result.unmatched.toLocaleString()} Customer names are waiting for review.`,
    };
  } catch (err) {
    return failure(err);
  }
}

export async function uploadContacts(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file." };

  const { rows, errors, skipped } = parseContactsCsv(await file.text());
  if (errors.length) return errorList(errors);

  try {
    const [{ result }] = await query<{ result: { contacts: number; accounts: number; unmatched: number } }>(
      "select import_contacts($1::json) as result",
      [JSON.stringify(rows)],
    );
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        `Loaded ${result.contacts.toLocaleString()} contacts` +
        (skipped ? ` (skipped ${skipped} rows with no DBA Name)` : "") +
        `. ${result.accounts.toLocaleString()} accounts; ` +
        `${result.unmatched.toLocaleString()} Customer names are waiting for review.`,
    };
  } catch (err) {
    return failure(err);
  }
}

export async function linkName(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const raw = String(formData.get("raw") ?? "");
  const target = field(formData, "target");
  if (!target) return { ok: false, message: "Type an account or contact name." };
  try {
    const [{ name }] = await query<{ name: string }>("select link_name($1, $2) as name", [raw, target]);
    revalidatePath("/", "layout");
    return { ok: true, message: `Linked to ${name}.` };
  } catch (err) {
    return failure(err);
  }
}

export async function createAccountForName(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const raw = String(formData.get("raw") ?? "");
  try {
    await query("select create_account_for_name($1, $2)", [raw, field(formData, "city")]);
    revalidatePath("/", "layout");
    return { ok: true, message: "Account created." };
  } catch (err) {
    return failure(err);
  }
}

export async function setCityRegion(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  try {
    await query("select set_city_region($1, $2)", [field(formData, "city"), field(formData, "region")]);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return failure(err);
  }
}

export async function overrideRep(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const [account] = await query<{ id: string }>("select id from accounts where canonical_name = $1", [
    field(formData, "account"),
  ]);
  if (!account) return { ok: false, message: "No account has that name." };
  const [rep] = await query<{ id: string; name: string }>("select id, name from reps where id = $1", [
    Number(field(formData, "rep")),
  ]);
  if (!rep) return { ok: false, message: "Choose a rep." };
  await query(
    `insert into account_reps (account_id, rep_id, source) values ($1, $2, 'override')
     on conflict (account_id) do update set rep_id = excluded.rep_id, source = 'override'`,
    [account.id, rep.id],
  );
  revalidatePath("/", "layout");
  return { ok: true, message: `Assigned to ${rep.name}.` };
}
