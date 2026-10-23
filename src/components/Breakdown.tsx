import { useMemo, useState } from "react";
import { consumption, spendingByCategory } from "../lib/balances";
import { formatMoney } from "../lib/money";
import type { Category, Group } from "../lib/types";
import { CATEGORY_ICON } from "./ui";

export function Breakdown({ group }: { group: Group }) {
  const [view, setView] = useState<"category" | "person">("category");

  const rows = useMemo(() => {
    if (view === "category") {
      return spendingByCategory(group).map((r) => ({
        key: r.category, label: `${CATEGORY_ICON[r.category as Category]} ${r.category}`, amount: r.amount,
      }));
    }
    const used = consumption(group);
    return group.members
      .map((m) => ({ key: m.id, label: m.name, amount: used.get(m.id) ?? 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [group, view]);

  if (group.expenses.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.amount));

  return (
    <section className="card" aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading">
        Spending
        <span className="tabs" role="tablist" aria-label="Group spending by">
          <button role="tab" aria-selected={view === "category"} onClick={() => setView("category")}>By category</button>
          <button role="tab" aria-selected={view === "person"} onClick={() => setView("person")}>By person</button>
        </span>
      </h2>
      {rows.map((r) => (
        <div className="hbar" key={r.key}>
          <span className="label">{r.label}</span>
          <span className="track" aria-hidden="true"><span className="fill" style={{ width: `${(r.amount / max) * 100}%`, display: "block" }} /></span>
          <span className="num" style={{ textAlign: "right" }}>{formatMoney(r.amount, group.currency)}</span>
        </div>
      ))}
      {view === "person" && <p className="muted" style={{ fontSize: "0.82rem", margin: "8px 0 0" }}>Each person's share of costs, whoever paid.</p>}
    </section>
  );
}
