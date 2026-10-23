import { useState, type FormEvent } from "react";
import type { Group } from "../lib/types";
import { useStore } from "../state/store";
import { Avatar, useToast } from "./ui";

export function Members({ group }: { group: Group }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const err = dispatch({ type: "member/add", groupId: group.id, name });
    setError(err);
    if (!err) setName("");
  }

  function remove(id: string) {
    const err = dispatch({ type: "member/remove", groupId: group.id, memberId: id });
    if (err) toast({ message: err, kind: "error" });
  }

  return (
    <section className="card" aria-labelledby="people-heading">
      <h2 id="people-heading">People <span className="muted num">{group.members.length}</span></h2>
      <div className="members">
        {group.members.map((m) => (
          <span className="chip" key={m.id}>
            <Avatar id={m.id} name={m.name} />
            {m.name}
            <button onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`} title="Remove">×</button>
          </span>
        ))}
      </div>
      <form className="inline-form" onSubmit={add}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a person"
          aria-label="New person's name" aria-invalid={!!error} maxLength={40} />
        <button className="btn" type="submit">Add</button>
      </form>
      {error && <p className="error" role="alert" style={{ margin: "8px 0 0" }}>{error}</p>}
    </section>
  );
}
