import { useMemo } from "react";
import { computeBalances, simplifyDebts } from "../lib/balances";
import { formatMoney } from "../lib/money";
import type { Group } from "../lib/types";
import { useStore } from "../state/store";
import { Avatar, memberName, useToast } from "./ui";

export function Balances({ group }: { group: Group }) {
  const { dispatch, undo } = useStore();
  const toast = useToast();
  const balances = useMemo(() => computeBalances(group), [group]);
  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  const max = Math.max(1, ...[...balances.values()].map(Math.abs));
  const fmt = (c: number, signed = false) => formatMoney(c, group.currency, { signed });

  function markPaid(from: string, to: string, amount: number) {
    dispatch({ type: "settlement/add", groupId: group.id, settlement: { from, to, amount } });
    toast({
      message: `Recorded: ${memberName(group, from)} paid ${memberName(group, to)} ${fmt(amount)}`,
      kind: "info",
      action: { label: "Undo", run: undo },
    });
  }

  return (
    <>
      <section className="card" aria-labelledby="balances-heading">
        <h2 id="balances-heading">Balances</h2>
        {group.members.map((m) => {
          const b = balances.get(m.id) ?? 0;
          const width = `${(Math.abs(b) / max) * 50}%`;
          const state = b > 0 ? "pos" : b < 0 ? "neg" : "";
          return (
            <div className="balance" key={m.id}>
              <span className="who">{m.name}</span>
              <span className="track" aria-hidden="true">
                {b !== 0 && <span className={`bar ${state}`} style={{ width }} />}
              </span>
              <span className={`amt num ${state}`} aria-label={`${m.name} ${b > 0 ? "is owed" : b < 0 ? "owes" : "is settled"} ${fmt(Math.abs(b))}`}>
                {fmt(b, true)}
              </span>
            </div>
          );
        })}
      </section>

      <section className="card" aria-labelledby="settle-heading">
        <h2 id="settle-heading">
          Settle up
          {transfers.length > 0 && <span className="muted">{transfers.length} {transfers.length === 1 ? "payment" : "payments"}</span>}
        </h2>
        {transfers.length === 0 ? (
          <div className="settled">✓ Everyone is settled up</div>
        ) : (
          <>
            {transfers.map((t) => (
              <div className="transfer" key={`${t.from}-${t.to}`}>
                <Avatar id={t.from} name={memberName(group, t.from)} />
                <span className="desc" style={{ flex: 1 }}>
                  <b>{memberName(group, t.from)}</b> pays <b>{memberName(group, t.to)}</b>
                  <div className="num" style={{ fontWeight: 700 }}>{fmt(t.amount)}</div>
                </span>
                <button className="btn small" onClick={() => markPaid(t.from, t.to, t.amount)}
                  aria-label={`Mark ${memberName(group, t.from)} paid ${memberName(group, t.to)}`}>
                  Mark paid
                </button>
              </div>
            ))}
            <p className="muted" style={{ fontSize: "0.82rem", margin: "6px 0 0" }}>
              The fewest payments that settle everyone. Nobody pays more than they owe.
            </p>
          </>
        )}

        {group.settlements.length > 0 && (
          <>
            <div className="day" style={{ marginTop: 16 }}>Payments recorded</div>
            {[...group.settlements].reverse().map((s) => (
              <div className="payment" key={s.id}>
                <span>{memberName(group, s.from)} → {memberName(group, s.to)} <span className="muted">· {s.date}</span></span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <b className="num">{fmt(s.amount)}</b>
                  <button className="btn ghost small" aria-label="Delete payment"
                    onClick={() => dispatch({ type: "settlement/delete", groupId: group.id, settlementId: s.id })}>✕</button>
                </span>
              </div>
            ))}
          </>
        )}
      </section>
    </>
  );
}
