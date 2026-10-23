import { allocate, formatMoney, type Cents } from "./money";
import type { Expense, Id, Split } from "./types";

export type SplitResult =
  | { ok: true; shares: Map<Id, Cents> }
  | { ok: false; error: string };

/**
 * Work out what each participant owes for an expense. Every successful result
 * sums to exactly `amount`, so no cent is ever created or lost.
 */
export function computeShares(amount: Cents, split: Split, currency = "USD"): SplitResult {
  const people = [...new Set(split.participants)];
  if (people.length === 0) return { ok: false, error: "Choose at least one person to split with" };
  if (amount <= 0) return { ok: false, error: "Amount must be greater than zero" };
  const value = (id: Id) => split.values?.[id] ?? 0;

  switch (split.mode) {
    case "equal":
      return zip(people, allocate(amount, people.map(() => 1)));

    case "exact": {
      const parts = people.map(value);
      if (parts.some((p) => !Number.isInteger(p) || p < 0)) return { ok: false, error: "Enter a valid amount for everyone selected" };
      const sum = parts.reduce((a, b) => a + b, 0);
      if (sum !== amount) {
        const diff = amount - sum;
        return {
          ok: false,
          error: diff > 0
            ? `${formatMoney(diff, currency)} left to assign`
            : `Over by ${formatMoney(-diff, currency)}`,
        };
      }
      return zip(people, parts);
    }

    case "percent": {
      const pcts = people.map(value);
      if (pcts.some((p) => !(p >= 0))) return { ok: false, error: "Percentages must be positive" };
      const sum = pcts.reduce((a, b) => a + b, 0);
      // Compare in hundredths of a percent to dodge float noise (33.33 * 3 etc).
      if (Math.round(sum * 100) !== 10_000) return { ok: false, error: `Percentages add up to ${round2(sum)}%, not 100%` };
      return zip(people, allocate(amount, pcts));
    }

    case "shares": {
      const weights = people.map(value);
      if (weights.some((w) => !(w >= 0))) return { ok: false, error: "Shares must be positive" };
      if (weights.every((w) => w === 0)) return { ok: false, error: "At least one person needs a share" };
      return zip(people, allocate(amount, weights));
    }
  }
}

export function expenseShares(expense: Expense, currency?: string): Map<Id, Cents> {
  const result = computeShares(expense.amount, expense.split, currency);
  // Stored expenses are validated on save; an invalid one means corrupted data.
  if (!result.ok) throw new Error(`Invalid split on "${expense.description}": ${result.error}`);
  return result.shares;
}

function zip(ids: Id[], amounts: Cents[]): SplitResult {
  return { ok: true, shares: new Map(ids.map((id, i) => [id, amounts[i]!])) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
