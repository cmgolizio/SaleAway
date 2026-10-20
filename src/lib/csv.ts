import Papa from "papaparse";

export const SALES_HEADERS = [
  "Invoice Date", "Invoice Type", "Invoice Number", "Customer", "Cust Type", "Sales Person", "SKU", "Vintage",
  "Supplier", "Producer", "Selection", "Volume", "Quantity", "Item Price", "Total Price",
];
export const INVOICE_TYPES = ["Invoice", "Credit Invoice", "Sample Invoice", "Sample Credit Invoice"];

const MAX_ERRORS = 20;

type Parsed<T> = { rows: T[]; errors: string[] };

function readCsv(text: string): { header: string[]; lines: string[][]; errors: string[] } {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const errors = result.errors.slice(0, MAX_ERRORS).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
  const [header = [], ...lines] = result.data;
  return { header: header.map((h) => h.trim()), lines, errors };
}

function blank(s: string): string | null {
  return s.trim() === "" ? null : s.trim();
}

// M/D/YY or M/D/YYYY -> YYYY-MM-DD, or null if not a real date.
function isoDate(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s.trim());
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  if (d.getUTCMonth() !== Number(m[1]) - 1 || d.getUTCDate() !== Number(m[2])) return null;
  return d.toISOString().slice(0, 10);
}

// Keeps numbers as strings so Postgres stores them exactly.
function decimal(s: string): string | null {
  const v = s.trim().replace(/[$,]/g, "");
  return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
}

// Rows come back in export column order, ready for import_sales().
export function parseSalesCsv(text: string): Parsed<(string | null)[]> {
  const { header, lines, errors } = readCsv(text);
  if (header.join(",") !== SALES_HEADERS.join(",")) {
    return { rows: [], errors: [`Headers don't match the sales export. Expected: ${SALES_HEADERS.join(", ")}`] };
  }
  const rows: (string | null)[][] = [];
  lines.forEach((cells, i) => {
    if (errors.length >= MAX_ERRORS) return;
    const line = i + 2;
    if (cells.length !== SALES_HEADERS.length) {
      errors.push(`Line ${line}: expected ${SALES_HEADERS.length} columns, found ${cells.length}.`);
      return;
    }
    const [date, type, number, customer, custType, salesPerson, sku, vintage, supplier, producer, selection, volume,
      quantity, itemPrice, totalPrice] = cells;
    const problems: string[] = [];
    const iso = isoDate(date);
    if (!iso) problems.push(`bad Invoice Date "${date}"`);
    if (!INVOICE_TYPES.includes(type.trim())) problems.push(`unknown Invoice Type "${type}"`);
    if (!blank(number)) problems.push("missing Invoice Number");
    if (!blank(producer) || !blank(selection)) problems.push("missing Producer or Selection");
    const nums = [quantity, itemPrice, totalPrice].map(decimal);
    if (nums.some((n) => n === null)) problems.push("Quantity, Item Price and Total Price must be numbers");
    if (problems.length) {
      errors.push(`Line ${line}: ${problems.join("; ")}.`);
      return;
    }
    rows.push([
      iso, type.trim(), number.trim(),
      // Customer is kept exactly as exported; it is the alias key.
      customer.trim() === "" ? null : customer,
      blank(custType), blank(salesPerson), blank(sku), blank(vintage), blank(supplier),
      producer.trim(), selection.trim(), blank(volume), ...nums,
    ]);
  });
  return { rows: errors.length ? [] : rows, errors };
}

// Finds the DBA Name and City (or Ship City) columns by header; other columns are ignored.
export function parseContactsCsv(text: string): Parsed<[string, string | null]> & { skipped: number } {
  const { header, lines, errors } = readCsv(text);
  const lower = header.map((h) => h.toLowerCase());
  const nameCol = lower.indexOf("dba name");
  const cityCol = lower.includes("city") ? lower.indexOf("city") : lower.indexOf("ship city");
  if (nameCol < 0 || cityCol < 0) {
    return {
      rows: [],
      skipped: 0,
      errors: [`The file needs "DBA Name" and "City" or "Ship City" columns. Found: ${header.join(", ")}`],
    };
  }
  const rows: [string, string | null][] = [];
  let skipped = 0;
  for (const cells of lines) {
    const name = blank(cells[nameCol] ?? "");
    if (!name) {
      skipped++;
      continue;
    }
    rows.push([name, blank(cells[cityCol] ?? "")]);
  }
  return { rows, skipped, errors };
}
