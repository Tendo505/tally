import { useState, type FormEvent } from "react";
import { sampleGroup } from "../lib/sample";
import { useStore } from "../state/store";

const CURRENCIES = ["USD", "EUR", "GBP", "MYR", "SGD", "JPY", "INR", "AUD", "CAD"];

export function NewGroupForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const { dispatch } = useStore();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [people, setPeople] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const err = dispatch({ type: "group/create", name, currency, members: people.split(/[,\n]/) });
    setError(err);
    if (!err) onDone?.();
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="row">
        <label className="field">
          <span>Group name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend in Penang" autoFocus maxLength={60} />
        </label>
        <label className="field">
          <span>Currency</span>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span>People (comma separated, include yourself)</span>
        <input className="input" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="Aisha, Ben, Chen" />
      </label>
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
        <button className="btn primary" type="submit">Create group</button>
      </div>
    </form>
  );
}

export function Welcome() {
  const { dispatch } = useStore();
  return (
    <div className="welcome">
      <h1>Split costs.<br />Settle up in fewer payments.</h1>
      <p className="lead">
        Track shared expenses for trips, flats and dinners. Tally works out who owes whom, down to the cent,
        and finds the shortest way to pay everyone back.
      </p>
      <NewGroupForm />
      <p style={{ textAlign: "center", margin: "16px 0 0" }}>
        <button className="btn ghost" onClick={() => dispatch({ type: "group/import", group: sampleGroup() })}>
          Or explore a sample trip →
        </button>
      </p>
      <div className="features">
        <div><b>4 ways to split</b>Equally, exact amounts, percentages or shares.</div>
        <div><b>Cent-exact</b>Integer money math. Rounding never loses a cent.</div>
        <div><b>Private</b>Data stays in your browser. Share by link, no account.</div>
      </div>
    </div>
  );
}
