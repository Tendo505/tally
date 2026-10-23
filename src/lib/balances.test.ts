import { describe, expect, it } from "vitest";
import { computeBalances, consumption, simplifyDebts, spendingByCategory, totalSpent } from "./balances";
import { rng } from "./money.test";
import { sampleGroup } from "./sample";
import { computeShares } from "./split";
import type { Group } from "./types";

const group = (overrides: Partial<Group> = {}): Group => ({
  id: "g", name: "Test", currency: "USD", createdAt: "", settlements: [],
  members: ["a", "b", "c"].map((id) => ({ id, name: id.toUpperCase() })),
  expenses: [],
  ...overrides,
});

describe("computeShares", () => {
  it("equal", () => {
    const r = computeShares(1000, { mode: "equal", participants: ["a", "b", "c"] });
    expect(r.ok && [...r.shares.values()]).toEqual([334, 333, 333]);
  });

  it("exact must add up", () => {
    expect(computeShares(1000, { mode: "exact", participants: ["a", "b"], values: { a: 600, b: 400 } }).ok).toBe(true);
    const under = computeShares(1000, { mode: "exact", participants: ["a", "b"], values: { a: 600, b: 300 } });
    expect(!under.ok && under.error).toBe("$1.00 left to assign");
    const over = computeShares(1000, { mode: "exact", participants: ["a", "b"], values: { a: 600, b: 500 } });
    expect(!over.ok && over.error).toBe("Over by $1.00");
  });

  it("percent must total 100, tolerating float noise", () => {
    const thirds = computeShares(1000, { mode: "percent", participants: ["a", "b", "c"], values: { a: 33.33, b: 33.33, c: 33.34 } });
    expect(thirds.ok && [...thirds.shares.values()].reduce((x, y) => x + y)).toBe(1000);
    const bad = computeShares(1000, { mode: "percent", participants: ["a", "b"], values: { a: 50, b: 40 } });
    expect(!bad.ok && bad.error).toMatch(/90%/);
  });

  it("shares split by weight", () => {
    const r = computeShares(900, { mode: "shares", participants: ["a", "b"], values: { a: 2, b: 1 } });
    expect(r.ok && Object.fromEntries(r.shares)).toEqual({ a: 600, b: 300 });
  });

  it("rejects empty participants and non-positive amounts", () => {
    expect(computeShares(1000, { mode: "equal", participants: [] }).ok).toBe(false);
    expect(computeShares(0, { mode: "equal", participants: ["a"] }).ok).toBe(false);
  });

  it("ignores duplicate participants", () => {
    const r = computeShares(1000, { mode: "equal", participants: ["a", "a", "b"] });
    expect(r.ok && Object.fromEntries(r.shares)).toEqual({ a: 500, b: 500 });
  });
});

describe("computeBalances", () => {
  it("payer is credited, participants debited", () => {
    const g = group({
      expenses: [{ id: "1", description: "Dinner", amount: 3000, paidBy: "a", date: "2026-01-01", category: "food",
        split: { mode: "equal", participants: ["a", "b", "c"] } }],
    });
    expect(Object.fromEntries(computeBalances(g))).toEqual({ a: 2000, b: -1000, c: -1000 });
  });

  it("settlements move balances toward zero", () => {
    const g = group({
      expenses: [{ id: "1", description: "Dinner", amount: 3000, paidBy: "a", date: "2026-01-01", category: "food",
        split: { mode: "equal", participants: ["a", "b", "c"] } }],
      settlements: [{ id: "s", from: "b", to: "a", amount: 1000, date: "2026-01-02" }],
    });
    expect(Object.fromEntries(computeBalances(g))).toEqual({ a: 1000, b: 0, c: -1000 });
  });

  it("the sample trip balances sum to zero", () => {
    const b = computeBalances(sampleGroup());
    expect([...b.values()].reduce((x, y) => x + y)).toBe(0);
  });
});

describe("simplifyDebts", () => {
  const settle = (balances: Record<string, number>) => simplifyDebts(new Map(Object.entries(balances)));

  it("nothing to do when everyone is even", () => {
    expect(settle({ a: 0, b: 0 })).toEqual([]);
  });

  it("chains collapse: a owes b, b owes c  =>  a pays c directly", () => {
    // a: -10, b: 0, c: +10
    expect(settle({ a: -1000, b: 0, c: 1000 })).toEqual([{ from: "a", to: "c", amount: 1000 }]);
  });

  it("exact matches are paired first, avoiding an extra payment", () => {
    // Greedy alone would make d1 (-7) pay c1 (+7)... here we check the plan is 2 payments, not 3.
    const plan = settle({ d1: -500, d2: -300, c1: 300, c2: 500 });
    expect(plan).toHaveLength(2);
    expect(plan).toContainEqual({ from: "d1", to: "c2", amount: 500 });
    expect(plan).toContainEqual({ from: "d2", to: "c1", amount: 300 });
  });

  it("is deterministic", () => {
    const b = { a: -700, b: -300, c: 400, d: 600 };
    expect(settle(b)).toEqual(settle({ d: 600, c: 400, b: -300, a: -700 }));
  });

  it("rejects balances that don't sum to zero", () => {
    expect(() => settle({ a: -100, b: 50 })).toThrow();
  });

  it("property: plans settle everyone exactly, with at most n-1 positive payments", () => {
    const rand = rng(7);
    for (let run = 0; run < 1000; run++) {
      const n = 2 + Math.floor(rand() * 10);
      const balances: Record<string, number> = {};
      let sum = 0;
      for (let i = 0; i < n - 1; i++) {
        const v = Math.round((rand() - 0.5) * 200_000);
        balances[`m${i}`] = v;
        sum += v;
      }
      balances[`m${n - 1}`] = -sum;

      const plan = settle(balances);
      const after = { ...balances };
      for (const t of plan) {
        expect(t.amount).toBeGreaterThan(0);
        expect(Number.isInteger(t.amount)).toBe(true);
        expect(t.from).not.toBe(t.to);
        // Nobody pays more than they owe, nobody receives more than they're owed.
        expect(balances[t.from]!).toBeLessThan(0);
        expect(balances[t.to]!).toBeGreaterThan(0);
        after[t.from]! += t.amount;
        after[t.to]! -= t.amount;
      }
      expect(Object.values(after).every((v) => v === 0)).toBe(true);
      const nonZero = Object.values(balances).filter((v) => v !== 0).length;
      expect(plan.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
    }
  });
});

describe("stats", () => {
  it("totals, consumption and categories", () => {
    const g = sampleGroup();
    expect(totalSpent(g)).toBe(64_000 + 3_850 + 11_240 + 18_000 + 4_637 + 960);
    const used = consumption(g);
    expect([...used.values()].reduce((a, b) => a + b)).toBe(totalSpent(g));
    expect(spendingByCategory(g)[0]).toEqual({ category: "lodging", amount: 64_000 });
  });
});
