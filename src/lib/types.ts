import type { Cents } from "./money";

export type Id = string;

export interface Member {
  id: Id;
  name: string;
}

export type SplitMode = "equal" | "exact" | "percent" | "shares";

/**
 * How an expense is divided among participants.
 *  - equal:   everyone in `participants` pays the same (leftover cents distributed fairly)
 *  - exact:   `values` holds each person's amount in cents; must sum to the total
 *  - percent: `values` holds percentages; must sum to 100
 *  - shares:  `values` holds relative weights, e.g. 2 nights vs 3 nights
 */
export interface Split {
  mode: SplitMode;
  participants: Id[];
  values?: Record<Id, number>;
}

export const CATEGORIES = ["food", "lodging", "transport", "activities", "groceries", "utilities", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Expense {
  id: Id;
  description: string;
  amount: Cents;
  paidBy: Id;
  date: string; // YYYY-MM-DD
  category: Category;
  split: Split;
}

/** A recorded repayment: `from` paid `to` outside the app. */
export interface Settlement {
  id: Id;
  from: Id;
  to: Id;
  amount: Cents;
  date: string;
}

export interface Group {
  id: Id;
  name: string;
  currency: string;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  createdAt: string;
}

export function newId(): Id {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
