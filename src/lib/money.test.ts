import { describe, expect, it } from "vitest";
import { allocate, formatMoney, parseMoney } from "./money";

/** Small seeded PRNG so randomized tests are reproducible. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe("parseMoney", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.05", 1205],
    ["0.99", 99],
    [" 1,234.56 ", 123456],
    ["$7.05", 705],
    ["€ 3", 300],
    ["12.", 1200],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(["", "abc", "-5", "1.234", "1.2.3", "12a"])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it("never uses float math (0.1 + 0.2 problem)", () => {
    expect(parseMoney("0.10")! + parseMoney("0.20")!).toBe(30);
  });
});

describe("formatMoney", () => {
  it("formats currencies and signs", () => {
    expect(formatMoney(123456, "USD")).toBe("$1,234.56");
    expect(formatMoney(-500, "EUR")).toBe("-€5.00");
    expect(formatMoney(500, "USD", { signed: true })).toBe("+$5.00");
    expect(formatMoney(0, "USD", { signed: true })).toBe("$0.00");
  });
});

describe("allocate (largest remainder)", () => {
  it("splits evenly with leftover cents going first-come", () => {
    expect(allocate(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocate(1001, [1, 1, 1])).toEqual([334, 334, 333]);
    expect(allocate(100, [1, 1, 1, 1, 1, 1, 1])).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("respects weights", () => {
    expect(allocate(1000, [3, 1])).toEqual([750, 250]);
    expect(allocate(64000, [4, 4, 4, 3])).toEqual([17067, 17067, 17066, 12800]);
  });

  it("gives leftovers to the largest fractional remainders, not just the first", () => {
    // Exact shares: 3.33.., 6.66.. -> floors 3, 6; leftover 1 goes to the .66 part.
    expect(allocate(10, [1, 2])).toEqual([3, 7]);
  });

  it("handles zero weights and zero totals", () => {
    expect(allocate(500, [1, 0, 1])).toEqual([250, 0, 250]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });

  it("rejects invalid input", () => {
    expect(() => allocate(100, [])).toThrow();
    expect(() => allocate(100, [0, 0])).toThrow();
    expect(() => allocate(-1, [1])).toThrow();
    expect(() => allocate(1.5, [1])).toThrow();
    expect(() => allocate(100, [1, -1])).toThrow();
  });

  it("property: parts are integers, sum exactly to the total, and are within 1 cent of the exact share", () => {
    const rand = rng(42);
    for (let run = 0; run < 2000; run++) {
      const n = 1 + Math.floor(rand() * 12);
      const weights: number[] = Array.from({ length: n }, () => (rand() < 0.15 ? 0 : Math.round(rand() * 1000) / 10));
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const total = Math.floor(rand() * 10_000_000);
      const parts = allocate(total, weights);
      const sum = weights.reduce((a, b) => a + b, 0);

      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      parts.forEach((p, i) => {
        expect(Number.isInteger(p)).toBe(true);
        expect(Math.abs(p - (total * weights[i]!) / sum)).toBeLessThan(1);
      });
    }
  });
});
