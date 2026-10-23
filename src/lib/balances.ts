import type { Cents } from "./money";
import { expenseShares } from "./split";
import type { Group, Id } from "./types";

export interface Transfer {
  from: Id;
  to: Id;
  amount: Cents;
}

/**
 * Net balance per member: positive means the group owes them money,
 * negative means they owe the group. Balances always sum to zero.
 */
export function computeBalances(group: Group): Map<Id, Cents> {
  const balances = new Map<Id, Cents>(group.members.map((m) => [m.id, 0]));
  const add = (id: Id, delta: Cents) => balances.set(id, (balances.get(id) ?? 0) + delta);

  for (const expense of group.expenses) {
    add(expense.paidBy, expense.amount);
    for (const [id, share] of expenseShares(expense, group.currency)) add(id, -share);
  }
  for (const s of group.settlements) {
    add(s.from, s.amount); // paying back reduces what you owe
    add(s.to, -s.amount);
  }
  return balances;
}

/**
 * Turn net balances into a short list of payments that settles everyone.
 *
 * Finding the true minimum number of payments is NP-hard (it's equivalent to
 * partitioning balances into the most zero-sum subsets), so this uses a fast
 * heuristic that is optimal in the common cases:
 *
 *   1. Pair off any debtor and creditor with exactly equal amounts. Each such
 *      pair is settled by one payment that touches nobody else.
 *   2. Then repeatedly have the largest debtor pay the largest creditor as much
 *      as possible. Each payment zeroes at least one person, so n people with
 *      non-zero balances need at most n - 1 payments.
 *
 * Ties are broken by member id, so the same balances always produce the same plan.
 */
export function simplifyDebts(balances: Map<Id, Cents>): Transfer[] {
  const debtors: { id: Id; amount: Cents }[] = [];
  const creditors: { id: Id; amount: Cents }[] = [];
  for (const [id, amount] of balances) {
    if (amount < 0) debtors.push({ id, amount: -amount });
    else if (amount > 0) creditors.push({ id, amount });
  }
  const total = (xs: { amount: Cents }[]) => xs.reduce((a, x) => a + x.amount, 0);
  if (total(debtors) !== total(creditors)) throw new Error("Balances do not sum to zero");

  const transfers: Transfer[] = [];
  const byId = (a: { id: Id }, b: { id: Id }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  debtors.sort(byId);
  creditors.sort(byId);

  // Pass 1: exact matches.
  for (const d of debtors) {
    const c = creditors.find((c) => c.amount === d.amount && c.amount > 0);
    if (c && d.amount > 0) {
      transfers.push({ from: d.id, to: c.id, amount: d.amount });
      c.amount = 0;
      d.amount = 0;
    }
  }

  // Pass 2: greedy largest-first.
  const largest = (xs: { id: Id; amount: Cents }[]) =>
    xs.reduce<{ id: Id; amount: Cents } | null>((best, x) => (x.amount > 0 && (!best || x.amount > best.amount) ? x : best), null);
  for (;;) {
    const d = largest(debtors);
    const c = largest(creditors);
    if (!d || !c) break;
    const amount = Math.min(d.amount, c.amount);
    transfers.push({ from: d.id, to: c.id, amount });
    d.amount -= amount;
    c.amount -= amount;
  }
  return transfers;
}

/** Total each member actually consumed (their shares), for the spending breakdown. */
export function consumption(group: Group): Map<Id, Cents> {
  const out = new Map<Id, Cents>(group.members.map((m) => [m.id, 0]));
  for (const e of group.expenses) {
    for (const [id, share] of expenseShares(e, group.currency)) out.set(id, (out.get(id) ?? 0) + share);
  }
  return out;
}

export function totalSpent(group: Group): Cents {
  return group.expenses.reduce((a, e) => a + e.amount, 0);
}

export function spendingByCategory(group: Group): { category: string; amount: Cents }[] {
  const totals = new Map<string, Cents>();
  for (const e of group.expenses) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
  return [...totals].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
