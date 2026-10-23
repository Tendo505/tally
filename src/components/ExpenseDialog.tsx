import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { centsToInput, formatMoney, parseMoney } from "../lib/money";
import { computeShares } from "../lib/split";
import { CATEGORIES, today, type Category, type Expense, type Group, type Id, type SplitMode } from "../lib/types";
import { useStore } from "../state/store";
import { CATEGORY_ICON } from "./ui";

const MODES: { mode: SplitMode; label: string; hint: string }[] = [
  { mode: "equal", label: "Equally", hint: "Everyone selected pays the same" },
  { mode: "exact", label: "Amounts", hint: "Enter what each person owes" },
  { mode: "percent", label: "Percent", hint: "Percentages must add up to 100" },
  { mode: "shares", label: "Shares", hint: "e.g. nights stayed: 3 vs 2" },
];

interface Props {
  group: Group;
  expense: Expense | null; // null = new
  onClose: () => void;
}

/** Per-person raw input strings, so half-typed values like "12." aren't lost. */
type Inputs = Record<Id, string>;

function initialInputs(expense: Expense | null, group: Group): Inputs {
  const out: Inputs = {};
  for (const m of group.members) {
    const v = expense?.split.values?.[m.id];
    out[m.id] = v === undefined ? "" : expense!.split.mode === "exact" ? centsToInput(v) : String(v);
  }
  return out;
}

export function ExpenseDialog({ group, expense, onClose }: Props) {
  const { dispatch } = useStore();
  const ref = useRef<HTMLDialogElement>(null);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amountText, setAmountText] = useState(expense ? centsToInput(expense.amount) : "");
  const [paidBy, setPaidBy] = useState<Id>(expense?.paidBy ?? group.members[0]!.id);
  const [date, setDate] = useState(expense?.date ?? today());
  const [category, setCategory] = useState<Category>(expense?.category ?? "food");
  const [mode, setMode] = useState<SplitMode>(expense?.split.mode ?? "equal");
  const [participants, setParticipants] = useState<Set<Id>>(new Set(expense?.split.participants ?? group.members.map((m) => m.id)));
  const [inputs, setInputs] = useState<Inputs>(() => initialInputs(expense, group));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // No cleanup that calls close(): it fires the "close" event, which would run
  // onClose during StrictMode's mount/unmount/mount check and dismiss the dialog
  // immediately. React removes the element on unmount, which ends modality.
  useEffect(() => {
    const dialog = ref.current!;
    if (!dialog.open) dialog.showModal?.();
  }, []);

  const amount = parseMoney(amountText);

  const values = useMemo(() => {
    if (mode === "equal") return undefined;
    const out: Record<Id, number> = {};
    for (const id of participants) {
      const raw = inputs[id] ?? "";
      out[id] = mode === "exact" ? parseMoney(raw) ?? NaN : raw.trim() === "" ? 0 : Number(raw);
    }
    return out;
  }, [mode, participants, inputs]);

  const split = { mode, participants: group.members.map((m) => m.id).filter((id) => participants.has(id)), values };
  const preview = amount !== null && amount > 0 ? computeShares(amount, split, group.currency) : null;

  const amountError = touched && (amount === null || amount <= 0) ? "Enter an amount like 12.50" : null;
  const splitError = preview && !preview.ok ? preview.error : null;

  function toggle(id: Id) {
    setParticipants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (amount === null || amount <= 0) return;
    const error = dispatch({
      type: "expense/save",
      groupId: group.id,
      expense: { ...(expense && { id: expense.id }), description: description.trim(), amount, paidBy, date, category, split },
    });
    if (error) setSubmitError(error);
    else onClose();
  }

  function remove() {
    if (!expense) return;
    dispatch({ type: "expense/delete", groupId: group.id, expenseId: expense.id });
    onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="expense-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-body">
          <h2 id="expense-title">{expense ? "Edit expense" : "Add an expense"}</h2>

          <label className="field">
            <span>Description</span>
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Dinner, taxi, tickets" autoFocus maxLength={80} />
          </label>

          <div className="row">
            <label className="field">
              <span>Amount ({group.currency})</span>
              <input className="input amount-input num" inputMode="decimal" value={amountText}
                onChange={(e) => setAmountText(e.target.value)} onBlur={() => setTouched(true)}
                placeholder="0.00" aria-invalid={!!amountError} />
              {amountError && <span className="error">{amountError}</span>}
            </label>
            <label className="field">
              <span>Paid by</span>
              <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {group.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          </div>

          <div className="row">
            <label className="field">
              <span>Date</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Category</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c]} {c[0]!.toUpperCase() + c.slice(1)}</option>)}
              </select>
            </label>
          </div>

          <div className="field">
            <span>Split</span>
            <div className="tabs" role="tablist" aria-label="Split method">
              {MODES.map((m) => (
                <button key={m.mode} type="button" role="tab" aria-selected={mode === m.mode} title={m.hint}
                  onClick={() => setMode(m.mode)}>{m.label}</button>
              ))}
            </div>
            <span className="muted" style={{ fontWeight: 400 }}>{MODES.find((m) => m.mode === mode)!.hint}</span>
          </div>

          <div className="split-table" role="group" aria-label="Who is involved">
            {group.members.map((m) => {
              const on = participants.has(m.id);
              const share = preview?.ok ? preview.shares.get(m.id) : undefined;
              return (
                <div key={m.id} className={`split-row ${on ? "" : "off"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(m.id)} aria-label={`Include ${m.name}`} />
                  <span>{m.name}</span>
                  {mode === "equal" ? <span /> : (
                    <input className="input num" inputMode="decimal" disabled={!on}
                      aria-label={`${m.name} ${mode === "exact" ? "amount" : mode === "percent" ? "percent" : "shares"}`}
                      placeholder={mode === "exact" ? "0.00" : mode === "percent" ? "%" : "0"}
                      value={inputs[m.id] ?? ""}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [m.id]: e.target.value }))} />
                  )}
                  <span className="share num">{on && share !== undefined ? formatMoney(share, group.currency) : ""}</span>
                </div>
              );
            })}
          </div>

          {splitError && <span className="error" role="alert">{splitError}</span>}
          {preview?.ok && <span className="ok-note">✓ Adds up to {formatMoney(amount!, group.currency)}</span>}
          {submitError && <span className="error" role="alert">{submitError}</span>}
        </div>

        <div className="dialog-actions">
          {expense && <button type="button" className="btn ghost danger spacer" onClick={remove}>Delete</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{expense ? "Save changes" : "Add expense"}</button>
        </div>
      </form>
    </dialog>
  );
}
