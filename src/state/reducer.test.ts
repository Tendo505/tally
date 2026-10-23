import { describe, expect, it } from "vitest";
import { sampleGroup } from "../lib/sample";
import { ActionError, historyReducer, initialState, reducer, type Action, type History } from "./reducer";
import { decodeShareFragment, encodeShareLink, loadState, saveState } from "./persistence";

const created = () => reducer(initialState, { type: "group/create", name: "Trip", currency: "USD", members: ["Ana", "Ben", " ana ", ""] });

describe("reducer", () => {
  it("creates a group with de-duplicated, trimmed members and selects it", () => {
    const s = created();
    expect(s.groups[0]!.members.map((m) => m.name)).toEqual(["Ana", "Ben"]);
    expect(s.activeGroupId).toBe(s.groups[0]!.id);
  });

  it("validates expenses before saving", () => {
    const s = created();
    const g = s.groups[0]!;
    const base = { description: "Taxi", amount: 1000, paidBy: g.members[0]!.id, date: "2026-01-01", category: "transport" as const };
    expect(() => reducer(s, { type: "expense/save", groupId: g.id, expense: { ...base, split: { mode: "equal", participants: [] } } }))
      .toThrow(ActionError);
    expect(() => reducer(s, { type: "expense/save", groupId: g.id, expense: { ...base, description: " ", split: { mode: "equal", participants: [g.members[0]!.id] } } }))
      .toThrow(/description/);
    const ok = reducer(s, { type: "expense/save", groupId: g.id, expense: { ...base, split: { mode: "equal", participants: [g.members[0]!.id] } } });
    expect(ok.groups[0]!.expenses).toHaveLength(1);
  });

  it("editing an expense replaces it in place", () => {
    let s = reducer(initialState, { type: "group/import", group: sampleGroup() });
    const g = s.groups[0]!;
    const e = g.expenses[1]!;
    s = reducer(s, { type: "expense/save", groupId: g.id, expense: { ...e, amount: 5000 } });
    expect(s.groups[0]!.expenses).toHaveLength(g.expenses.length);
    expect(s.groups[0]!.expenses[1]!.amount).toBe(5000);
  });

  it("refuses to remove a member who appears in expenses", () => {
    const s = reducer(initialState, { type: "group/import", group: sampleGroup() });
    const g = s.groups[0]!;
    expect(() => reducer(s, { type: "member/remove", groupId: g.id, memberId: "ana" })).toThrow(/existing expenses/);
  });

  it("rejects duplicate member names case-insensitively", () => {
    const s = created();
    expect(() => reducer(s, { type: "member/add", groupId: s.groups[0]!.id, name: "BEN" })).toThrow(/already/);
  });

  it("rejects self-payments and unknown members in settlements", () => {
    const s = created();
    const [a, b] = s.groups[0]!.members;
    const add = (from: string, to: string, amount: number): Action =>
      ({ type: "settlement/add", groupId: s.groups[0]!.id, settlement: { from, to, amount } });
    expect(() => reducer(s, add(a!.id, a!.id, 100))).toThrow(/themselves/);
    expect(() => reducer(s, add(a!.id, "ghost", 100))).toThrow(/Unknown/);
    expect(() => reducer(s, add(a!.id, b!.id, 0))).toThrow(/positive/);
  });

  it("imports are validated and always get a fresh id", () => {
    const s = reducer(initialState, { type: "group/import", group: sampleGroup() });
    expect(s.groups[0]!.id).not.toBe("sample");
    const broken = { ...sampleGroup(), expenses: [{ ...sampleGroup().expenses[0]!, paidBy: "nobody" }] };
    expect(() => reducer(initialState, { type: "group/import", group: broken })).toThrow(/Not a valid Tally group/);
  });

  it("deleting the active group selects another", () => {
    let s = reducer(initialState, { type: "group/import", group: sampleGroup() });
    s = reducer(s, { type: "group/import", group: sampleGroup() });
    const [first, second] = s.groups;
    s = reducer(s, { type: "group/delete", groupId: second!.id });
    expect(s.activeGroupId).toBe(first!.id);
  });
});

describe("history (undo/redo)", () => {
  const start: History = { past: [], present: initialState, future: [], labels: [] };

  it("undoes and redoes changes", () => {
    let h = historyReducer(start, { type: "group/import", group: sampleGroup() });
    const g = h.present.groups[0]!;
    h = historyReducer(h, { type: "expense/delete", groupId: g.id, expenseId: "e1" });
    expect(h.present.groups[0]!.expenses).toHaveLength(5);
    expect(h.labels.at(-1)).toBe("delete expense");

    h = historyReducer(h, { type: "undo" });
    expect(h.present.groups[0]!.expenses).toHaveLength(6);
    h = historyReducer(h, { type: "redo" });
    expect(h.present.groups[0]!.expenses).toHaveLength(5);
  });

  it("a new change clears the redo stack", () => {
    let h = historyReducer(start, { type: "group/import", group: sampleGroup() });
    const id = h.present.groups[0]!.id;
    h = historyReducer(h, { type: "group/rename", groupId: id, name: "A" });
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "group/rename", groupId: id, name: "B" });
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
  });

  it("switching groups is not an undo step", () => {
    let h = historyReducer(start, { type: "group/import", group: sampleGroup() });
    h = historyReducer(h, { type: "group/import", group: sampleGroup() });
    const pastBefore = h.past.length;
    h = historyReducer(h, { type: "group/select", groupId: h.present.groups[0]!.id });
    expect(h.past.length).toBe(pastBefore);
  });

  it("undo on empty history is a no-op", () => {
    expect(historyReducer(start, { type: "undo" })).toBe(start);
  });
});

describe("persistence", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    } as unknown as Storage;
  };

  it("round-trips state", () => {
    const storage = memoryStorage();
    const s = reducer(initialState, { type: "group/import", group: sampleGroup() });
    saveState(s, storage);
    expect(loadState(storage)).toEqual(s);
  });

  it("survives corrupt storage and drops invalid groups", () => {
    const storage = memoryStorage();
    storage.setItem("tally:v1", "{not json");
    expect(loadState(storage)).toEqual(initialState);
    storage.setItem("tally:v1", JSON.stringify({ groups: [{ id: "x", name: 5 }], activeGroupId: "x" }));
    expect(loadState(storage)).toEqual(initialState);
  });

  it("share links round-trip through compression", async () => {
    const g = sampleGroup();
    const url = await encodeShareLink(g, "https://example.test/tally/");
    expect(url.length).toBeLessThan(2000);
    const decoded = await decodeShareFragment(new URL(url).hash);
    expect(decoded?.expenses).toEqual(g.expenses);
    expect(decoded?.name).toBe("Lisbon trip");
  });
});
