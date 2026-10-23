import { computeShares } from "../lib/split";
import { newId, today, type Expense, type Group, type Id, type Settlement } from "../lib/types";

export interface AppState {
  groups: Group[];
  activeGroupId: Id | null;
}

export type Action =
  | { type: "group/create"; name: string; currency: string; members: string[] }
  | { type: "group/rename"; groupId: Id; name: string }
  | { type: "group/delete"; groupId: Id }
  | { type: "group/select"; groupId: Id }
  | { type: "group/import"; group: Group }
  | { type: "member/add"; groupId: Id; name: string }
  | { type: "member/rename"; groupId: Id; memberId: Id; name: string }
  | { type: "member/remove"; groupId: Id; memberId: Id }
  | { type: "expense/save"; groupId: Id; expense: Omit<Expense, "id"> & { id?: Id } }
  | { type: "expense/delete"; groupId: Id; expenseId: Id }
  | { type: "settlement/add"; groupId: Id; settlement: Omit<Settlement, "id" | "date"> & { date?: string } }
  | { type: "settlement/delete"; groupId: Id; settlementId: Id };

export const initialState: AppState = { groups: [], activeGroupId: null };

/** Thrown for actions that would make the data invalid; the UI shows the message. */
export class ActionError extends Error {}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "group/create": {
      const name = action.name.trim();
      if (!name) throw new ActionError("Give the group a name");
      const members = uniqueNames(action.members).map((n) => ({ id: newId(), name: n }));
      if (members.length === 0) throw new ActionError("Add at least one person");
      const group: Group = {
        id: newId(), name, currency: action.currency, members, expenses: [], settlements: [],
        createdAt: new Date().toISOString(),
      };
      return { groups: [...state.groups, group], activeGroupId: group.id };
    }

    case "group/rename":
      return updateGroup(state, action.groupId, (g) => {
        const name = action.name.trim();
        if (!name) throw new ActionError("Group name can't be empty");
        return { ...g, name };
      });

    case "group/delete": {
      const groups = state.groups.filter((g) => g.id !== action.groupId);
      const activeGroupId = state.activeGroupId === action.groupId ? groups[0]?.id ?? null : state.activeGroupId;
      return { groups, activeGroupId };
    }

    case "group/select":
      if (!state.groups.some((g) => g.id === action.groupId)) return state;
      return { ...state, activeGroupId: action.groupId };

    case "group/import": {
      validateGroup(action.group);
      // Always import as a copy so re-importing a shared link never overwrites.
      const group = { ...action.group, id: newId() };
      return { groups: [...state.groups, group], activeGroupId: group.id };
    }

    case "member/add":
      return updateGroup(state, action.groupId, (g) => {
        const name = action.name.trim();
        if (!name) throw new ActionError("Enter a name");
        if (g.members.some((m) => m.name.toLowerCase() === name.toLowerCase())) throw new ActionError(`${name} is already in this group`);
        return { ...g, members: [...g.members, { id: newId(), name }] };
      });

    case "member/rename":
      return updateGroup(state, action.groupId, (g) => {
        const name = action.name.trim();
        if (!name) throw new ActionError("Name can't be empty");
        if (g.members.some((m) => m.id !== action.memberId && m.name.toLowerCase() === name.toLowerCase())) {
          throw new ActionError(`${name} is already in this group`);
        }
        return { ...g, members: g.members.map((m) => (m.id === action.memberId ? { ...m, name } : m)) };
      });

    case "member/remove":
      return updateGroup(state, action.groupId, (g) => {
        const involved =
          g.expenses.some((e) => e.paidBy === action.memberId || e.split.participants.includes(action.memberId)) ||
          g.settlements.some((s) => s.from === action.memberId || s.to === action.memberId);
        if (involved) throw new ActionError("This person is part of existing expenses. Remove those first.");
        return { ...g, members: g.members.filter((m) => m.id !== action.memberId) };
      });

    case "expense/save":
      return updateGroup(state, action.groupId, (g) => {
        const expense = { ...action.expense, id: action.expense.id ?? newId() } as Expense;
        validateExpense(g, expense);
        const exists = g.expenses.some((e) => e.id === expense.id);
        const expenses = exists ? g.expenses.map((e) => (e.id === expense.id ? expense : e)) : [...g.expenses, expense];
        return { ...g, expenses };
      });

    case "expense/delete":
      return updateGroup(state, action.groupId, (g) => ({ ...g, expenses: g.expenses.filter((e) => e.id !== action.expenseId) }));

    case "settlement/add":
      return updateGroup(state, action.groupId, (g) => {
        const s: Settlement = { ...action.settlement, id: newId(), date: action.settlement.date ?? today() };
        if (s.from === s.to) throw new ActionError("Someone can't pay themselves");
        if (!(s.amount > 0) || !Number.isInteger(s.amount)) throw new ActionError("Payment must be a positive amount");
        if (!isMember(g, s.from) || !isMember(g, s.to)) throw new ActionError("Unknown member");
        return { ...g, settlements: [...g.settlements, s] };
      });

    case "settlement/delete":
      return updateGroup(state, action.groupId, (g) => ({ ...g, settlements: g.settlements.filter((s) => s.id !== action.settlementId) }));
  }
}

function updateGroup(state: AppState, groupId: Id, fn: (g: Group) => Group): AppState {
  let found = false;
  const groups = state.groups.map((g) => {
    if (g.id !== groupId) return g;
    found = true;
    return fn(g);
  });
  if (!found) throw new ActionError("Group not found");
  return { ...state, groups };
}

const isMember = (g: Group, id: Id) => g.members.some((m) => m.id === id);

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((n) => n.trim()).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
}

export function validateExpense(g: Group, e: Expense): void {
  if (!e.description.trim()) throw new ActionError("Add a description");
  if (!isMember(g, e.paidBy)) throw new ActionError("Choose who paid");
  if (e.split.participants.some((p) => !isMember(g, p))) throw new ActionError("Unknown participant");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new ActionError("Invalid date");
  const result = computeShares(e.amount, e.split, g.currency);
  if (!result.ok) throw new ActionError(result.error);
}

/** Imported data is untrusted: check its shape before it can reach the reducer's math. */
export function validateGroup(g: unknown): asserts g is Group {
  const fail = (why: string): never => { throw new ActionError(`Not a valid Tally group: ${why}`); };
  if (typeof g !== "object" || g === null) fail("not an object");
  const group = g as Group;
  if (typeof group.name !== "string" || typeof group.currency !== "string") fail("missing name or currency");
  if (!Array.isArray(group.members) || !Array.isArray(group.expenses) || !Array.isArray(group.settlements)) fail("missing lists");
  for (const m of group.members) if (typeof m?.id !== "string" || typeof m?.name !== "string") fail("bad member");
  for (const e of group.expenses) {
    if (typeof e?.amount !== "number" || !Number.isInteger(e.amount) || typeof e.split !== "object") fail("bad expense");
    try {
      validateExpense(group, e);
    } catch (err) {
      fail(`expense "${String(e.description)}": ${(err as Error).message}`);
    }
  }
  for (const s of group.settlements) {
    if (!Number.isInteger(s?.amount) || !isMember(group, s.from) || !isMember(group, s.to)) fail("bad settlement");
  }
}

// ---------- undo / redo ----------

export interface History {
  past: AppState[];
  present: AppState;
  future: AppState[];
  /** Short description of the last change, for the "Undo ..." tooltip. */
  labels: string[];
}

const HISTORY_LIMIT = 100;

export type HistoryAction = Action | { type: "undo" } | { type: "redo" };

/** Wraps the reducer with an undo stack. Selecting a group isn't an undoable edit. */
export function historyReducer(h: History, action: HistoryAction): History {
  if (action.type === "undo") {
    const previous = h.past[h.past.length - 1];
    if (!previous) return h;
    return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], labels: h.labels.slice(0, -1) };
  }
  if (action.type === "redo") {
    const next = h.future[0];
    if (!next) return h;
    return { past: [...h.past, h.present], present: next, future: h.future.slice(1), labels: [...h.labels, "redo"] };
  }
  const present = reducer(h.present, action);
  if (present === h.present) return h;
  if (action.type === "group/select") return { ...h, present };
  return {
    past: [...h.past, h.present].slice(-HISTORY_LIMIT),
    present,
    future: [],
    labels: [...h.labels, describe(action)].slice(-HISTORY_LIMIT),
  };
}

function describe(a: Action): string {
  switch (a.type) {
    case "expense/save": return a.expense.id ? "edit expense" : "add expense";
    case "expense/delete": return "delete expense";
    case "settlement/add": return "record payment";
    case "settlement/delete": return "delete payment";
    case "member/add": return "add person";
    case "member/remove": return "remove person";
    case "member/rename": return "rename person";
    case "group/create": return "create group";
    case "group/delete": return "delete group";
    case "group/rename": return "rename group";
    case "group/import": return "import group";
    case "group/select": return "switch group";
  }
}
