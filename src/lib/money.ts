// Money is always an integer number of minor units (cents). Floating point
// never touches a stored amount, so 0.1 + 0.2 problems can't creep in.

export type Cents = number;

/**
 * Parse user input like "12", "12.5", "1,234.56" or "$ 7.05" into cents.
 * Returns null for anything that isn't a valid non-negative amount with at
 * most two decimal places.
 */
export function parseMoney(input: string): Cents | null {
  const cleaned = input.trim().replace(/^[^\d.-]+/, "").replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(2, "0");
  const cents = whole * 100 + Number(frac);
  return Number.isSafeInteger(cents) ? cents : null;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(cents: Cents, currency = "USD", { signed = false } = {}): string {
  const key = `${currency}:${signed}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      signDisplay: signed ? "exceptZero" : "auto",
    });
    formatters.set(key, fmt);
  }
  return fmt.format(cents / 100);
}

/** Plain "12.34" for form inputs. */
export function centsToInput(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

/**
 * Split `total` cents in proportion to `weights` so the parts are integers
 * that sum to exactly `total` (the largest remainder / Hamilton method).
 *
 * Each part is the floor of its exact share. The leftover cents (always fewer
 * than the number of parts) go one each to the parts with the largest
 * fractional remainders, ties broken by position, so results are deterministic.
 *
 *   allocate(1000, [1, 1, 1])  ->  [334, 333, 333]
 */
export function allocate(total: Cents, weights: number[]): Cents[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  if (weights.length === 0) throw new RangeError("weights must not be empty");
  if (weights.some((w) => !(w >= 0) || !Number.isFinite(w))) throw new RangeError("weights must be finite and non-negative");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new RangeError("weights must not all be zero");

  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let leftover = total - parts.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0; k++, leftover--) parts[order[k % order.length]!.i]! += 1;
  return parts;
}
