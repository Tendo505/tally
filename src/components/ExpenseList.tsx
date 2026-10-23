import { useState } from "react";
import { formatMoney } from "../lib/money";
import type { Expense, Group } from "../lib/types";
import { CATEGORY_ICON, memberName } from "./ui";

const SPLIT_LABEL = { equal: "split equally", exact: "split by amount", percent: "split by %", shares: "split by shares" };

function formatDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function ExpenseList({ group, onEdit }: { group: Group; onEdit: (e: Expense) => void }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = group.expenses.filter((e) =>
    !q || e.description.toLowerCase().includes(q) || e.category.includes(q) || memberName(group, e.paidBy).toLowerCase().includes(q));

  // Newest first, grouped by day.
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const days = new Map<string, Expense[]>();
  for (const e of sorted) days.set(e.date, [...(days.get(e.date) ?? []), e]);

  return (
    <section className="card" aria-labelledby="expenses-heading">
      <h2 id="expenses-heading">
        Expenses <span className="muted num">{group.expenses.length}</span>
      </h2>
      {group.expenses.length > 4 && (
        <input className="input" style={{ width: "100%", marginBottom: 10 }} type="search" placeholder="Search expenses…"
          aria-label="Search expenses" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}
      {group.expenses.length === 0 ? (
        <div className="empty">
          <strong>No expenses yet</strong>
          Add the first one with the button above, or press <kbd>N</kbd>.
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">No expenses match “{query}”.</div>
      ) : (
        [...days].map(([day, expenses]) => (
          <div key={day}>
            <div className="day">{formatDay(day)}</div>
            {expenses.map((e) => (
              <button key={e.id} className="expense" onClick={() => onEdit(e)} aria-label={`Edit ${e.description}`}>
                <span className="cat-icon" aria-hidden="true">{CATEGORY_ICON[e.category]}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="title">{e.description}</div>
                  <div className="sub">
                    {memberName(group, e.paidBy)} paid · {e.split.participants.length} {e.split.participants.length === 1 ? "person" : "people"}
                  </div>
                </span>
                <span>
                  <div className="amount num">{formatMoney(e.amount, group.currency)}</div>
                  <div className="split-tag">{SPLIT_LABEL[e.split.mode]}</div>
                </span>
              </button>
            ))}
          </div>
        ))
      )}
    </section>
  );
}
