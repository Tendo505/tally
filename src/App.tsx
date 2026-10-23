import { useEffect, useMemo, useRef, useState } from "react";
import { Balances } from "./components/Balances";
import { Breakdown } from "./components/Breakdown";
import { ExpenseDialog } from "./components/ExpenseDialog";
import { ExpenseList } from "./components/ExpenseList";
import { Members } from "./components/Members";
import { NewGroupForm, Welcome } from "./components/NewGroup";
import { ToastProvider, useToast } from "./components/ui";
import { computeBalances, simplifyDebts, totalSpent } from "./lib/balances";
import { formatMoney } from "./lib/money";
import type { Expense, Group } from "./lib/types";
import { decodeShareFragment, encodeShareLink } from "./state/persistence";
import { StoreProvider, useActiveGroup, useStore } from "./state/store";
import type { AppState } from "./state/reducer";

export default function App({ initialState }: { initialState?: AppState }) {
  return (
    <StoreProvider initial={initialState}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </StoreProvider>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M9 10v12M14 10v12M19 10v12M7 20l18-8" stroke="var(--on-accent)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function Shell() {
  const { state, dispatch, undo, redo, canUndo, canRedo, undoLabel } = useStore();
  const group = useActiveGroup();
  const toast = useToast();
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Import a group shared via link (#share=...), then clean the URL.
  useEffect(() => {
    if (!location.hash.includes("share=")) return;
    decodeShareFragment(location.hash)
      .then((shared) => {
        if (!shared) return;
        dispatch({ type: "group/import", group: shared });
        toast({ message: `Imported “${shared.name}” from a shared link`, kind: "info" });
      })
      .catch(() => toast({ message: "That share link is damaged or incomplete", kind: "error" }))
      .finally(() => history.replaceState(null, "", location.pathname + location.search));
  }, [dispatch, toast]);

  // Keyboard shortcuts: N = new expense, Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (!mod && !e.altKey && e.key.toLowerCase() === "n" && group) {
        e.preventDefault();
        setEditing("new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group, undo, redo]);

  async function share(g: Group) {
    const url = await encodeShareLink(g, location.origin + location.pathname);
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: "Share link copied. Anyone with it gets their own copy of this group.", kind: "info" });
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  function exportJson(g: Group) {
    const blob = new Blob([JSON.stringify(g, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${g.name.replace(/[^\w-]+/g, "-").toLowerCase() || "group"}.tally.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(file: File) {
    try {
      const data = JSON.parse(await file.text());
      const err = dispatch({ type: "group/import", group: data });
      toast(err ? { message: err, kind: "error" } : { message: `Imported “${data.name}”`, kind: "info" });
    } catch {
      toast({ message: "That file isn't valid JSON", kind: "error" });
    }
  }

  function deleteGroup(g: Group) {
    dispatch({ type: "group/delete", groupId: g.id });
    toast({ message: `Deleted “${g.name}”`, kind: "info", action: { label: "Undo", run: undo } });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><Logo /> Tally</div>
        {state.groups.length > 0 && (
          <select className="input" aria-label="Switch group" value={state.activeGroupId ?? ""}
            onChange={(e) => (e.target.value === "__new" ? setCreating(true) : dispatch({ type: "group/select", groupId: e.target.value }))}>
            {state.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            <option value="__new">+ New group…</option>
          </select>
        )}
        <button className="btn ghost icon" onClick={undo} disabled={!canUndo} aria-label="Undo last change" title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo"}>↶</button>
        <button className="btn ghost icon" onClick={redo} disabled={!canRedo} aria-label="Redo last change" title="Redo (Ctrl+Shift+Z)">↷</button>
        <button className="btn ghost" onClick={() => fileInput.current?.click()} title="Import a .tally.json file">
          ⤓ <span className="label-text">Import</span>
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />
      </header>

      {creating ? (
        <div className="welcome" style={{ marginTop: 16 }}>
          <h1 style={{ fontSize: "1.8rem" }}>New group</h1>
          <NewGroupForm onDone={() => setCreating(false)} onCancel={() => setCreating(false)} />
        </div>
      ) : !group ? (
        <Welcome />
      ) : (
        <GroupView group={group} onAdd={() => setEditing("new")} onEdit={setEditing}
          onShare={() => void share(group)} onExport={() => exportJson(group)} onDelete={() => deleteGroup(group)} />
      )}

      {editing && group && (
        <ExpenseDialog group={group} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      <footer className="foot">
        Your data never leaves this browser unless you share it. ·{" "}
        <a href="https://github.com/Tendo505/tally">Source on GitHub</a>
      </footer>
    </div>
  );
}

interface GroupViewProps {
  group: Group;
  onAdd: () => void;
  onEdit: (e: Expense) => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function GroupView({ group, onAdd, onEdit, onShare, onExport, onDelete }: GroupViewProps) {
  const stats = useMemo(() => {
    const balances = computeBalances(group);
    const open = [...balances.values()].filter((b) => b > 0).reduce((a, b) => a + b, 0);
    return { total: totalSpent(group), open, payments: simplifyDebts(balances).length };
  }, [group]);
  const fmt = (c: number) => formatMoney(c, group.currency);

  return (
    <main>
      <div className="group-head">
        <div>
          <h1>{group.name}</h1>
          <div className="meta">{group.members.map((m) => m.name).join(", ")}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost small" onClick={onShare}>Share link</button>
          <button className="btn ghost small" onClick={onExport}>Export</button>
          <button className="btn ghost small danger" onClick={onDelete}>Delete group</button>
          <button className="btn primary" onClick={onAdd}>+ Add expense</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="label">Total spent</div><div className="value num">{fmt(stats.total)}</div></div>
        <div className="stat"><div className="label">Still owed</div><div className="value num">{fmt(stats.open)}</div></div>
        <div className="stat"><div className="label">To settle</div><div className="value num">{stats.payments} {stats.payments === 1 ? "payment" : "payments"}</div></div>
      </div>

      <div className="grid">
        <div className="stack">
          <ExpenseList group={group} onEdit={onEdit} />
        </div>
        <div className="stack">
          <Balances group={group} />
          <Breakdown group={group} />
          <Members group={group} />
        </div>
      </div>
    </main>
  );
}
