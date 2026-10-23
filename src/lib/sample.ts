import type { Group } from "./types";

/** A realistic demo group so first-time visitors can explore every feature. */
export function sampleGroup(): Group {
  const m = (id: string, name: string) => ({ id, name });
  return {
    id: "sample",
    name: "Lisbon trip",
    currency: "EUR",
    createdAt: new Date().toISOString(),
    members: [m("ana", "Ana"), m("ben", "Ben"), m("chloe", "Chloé"), m("dev", "Dev")],
    expenses: [
      {
        id: "e1", description: "Apartment (4 nights)", amount: 64_000, paidBy: "ana", date: "2026-05-02", category: "lodging",
        // Dev joined a night late: split by nights stayed.
        split: { mode: "shares", participants: ["ana", "ben", "chloe", "dev"], values: { ana: 4, ben: 4, chloe: 4, dev: 3 } },
      },
      {
        id: "e2", description: "Airport taxi", amount: 3_850, paidBy: "ben", date: "2026-05-02", category: "transport",
        split: { mode: "equal", participants: ["ana", "ben", "chloe"] },
      },
      {
        id: "e3", description: "Dinner at Time Out Market", amount: 11_240, paidBy: "chloe", date: "2026-05-03", category: "food",
        split: { mode: "equal", participants: ["ana", "ben", "chloe", "dev"] },
      },
      {
        id: "e4", description: "Sintra day tour", amount: 18_000, paidBy: "dev", date: "2026-05-04", category: "activities",
        split: { mode: "exact", participants: ["ana", "ben", "chloe", "dev"], values: { ana: 4_500, ben: 4_500, chloe: 4_500, dev: 4_500 } },
      },
      {
        id: "e5", description: "Groceries & wine", amount: 4_637, paidBy: "ana", date: "2026-05-04", category: "groceries",
        split: { mode: "percent", participants: ["ana", "ben", "chloe", "dev"], values: { ana: 40, ben: 20, chloe: 20, dev: 20 } },
      },
      {
        id: "e6", description: "Pastéis de nata", amount: 960, paidBy: "ben", date: "2026-05-05", category: "food",
        split: { mode: "equal", participants: ["ana", "ben", "chloe", "dev"] },
      },
    ],
    settlements: [],
  };
}
