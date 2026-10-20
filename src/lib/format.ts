const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function usd(value: string | number | null): string {
  return usdFormat.format(Number(value ?? 0));
}

export function pct(part: string | number, whole: string | number): string {
  return Number(whole) ? `${((Number(part) / Number(whole)) * 100).toFixed(1)}%` : "—";
}
