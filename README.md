# Tally

[![CI](https://github.com/Tendo505/tally/actions/workflows/ci.yml/badge.svg)](https://github.com/Tendo505/tally/actions/workflows/ci.yml)
![React 18](https://img.shields.io/badge/React-18-61dafb)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

**Split shared expenses fairly, and settle up in the fewest payments.** Tally tracks costs for trips, flatshares and dinners. It works out who owes whom down to the cent and suggests the shortest way to pay everyone back. No account needed: data stays in your browser.

**▶ Live app: https://tendo505.github.io/tally/** (click "explore a sample trip" to see it with data)

## Features

- **Four ways to split** an expense: equally, by exact amounts, by percentage, or by shares (e.g. nights stayed). A live preview shows each person's share, and validation explains what's wrong ("€10.00 left to assign", "Percentages add up to 90%, not 100%").
- **Settle-up plan:** turns a tangle of debts into at most *n − 1* payments, each marked paid with one click.
- **Balances chart** (diverging bars) and **spending breakdown** by category or by person
- **Undo / redo** for every change (<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>), with "Undo" on destructive toasts
- **Share by link:** the group is compressed into the URL fragment, which browsers never send to a server
- **Import / export** groups as JSON, validated on the way in
- **Offline-first:** persists to `localStorage` and degrades gracefully when storage is blocked or corrupt
- Keyboard shortcut <kbd>N</kbd> for a new expense, light/dark themes, and a responsive layout down to 360px

## The interesting parts

### Money is integers, always

Every amount is stored as an integer number of cents and parsed straight from text (`"12.05"` → `1205`), so floating-point error can never reach a balance. Splitting uses the **largest remainder method**:

```ts
allocate(1000, [1, 1, 1])     // [334, 333, 333]  (sums to exactly 1000)
allocate(64000, [4, 4, 4, 3]) // shares: 4 nights vs 3 nights
```

Each person gets the floor of their exact share. The leftover cents (always fewer than the number of people) go to those with the largest fractional remainders. That guarantees two things: **the parts always sum to the total**, and **nobody is more than one cent from their exact share**. A randomized property test checks both invariants over 2,000 random cases.

### Settling up in fewer payments

Net balances are computed from expenses and recorded payments. Turning them into payments is the interesting part. The true minimum number of payments is **NP-hard**: it's equivalent to partitioning people into as many zero-sum subgroups as possible. Tally uses a fast two-pass heuristic ([`balances.ts`](src/lib/balances.ts)):

1. **Exact matches first.** A debtor and creditor with identical amounts settle in one payment that touches nobody else. Greedy alone would often split these into two.
2. **Greedy largest-first.** The biggest debtor pays the biggest creditor. Every payment zeroes at least one person, so *n* people need **at most n − 1 payments**.

A property test generates 1,000 random groups and checks that every plan settles everyone exactly, never makes anyone pay more than they owe, and stays within *n − 1* payments.

### State: a pure reducer with undo

All changes go through one pure reducer ([`reducer.ts`](src/state/reducer.ts)) that validates every action, for example refusing to remove a person who still appears in an expense. A history wrapper keeps up to 100 past states for undo and redo, which is cheap because states are immutable and share structure. Switching groups is deliberately not an undo step.

### Bugs found while testing

- **StrictMode closed the dialog instantly.** The dialog's effect cleanup called `dialog.close()`, which fires a `close` event and so ran `onClose`. React's StrictMode mounts, unmounts and remounts every effect in development, so the dialog dismissed itself the moment it opened. The unit tests passed because they didn't render in StrictMode, and it only showed up in the browser. Fixed, and **all component tests now render inside `<StrictMode>`** exactly as `main.tsx` does. I confirmed that restoring the bug makes 3 tests fail.
- **Duplicate accessible names.** The toolbar's undo button and the toast's "Undo" action were both called "Undo", which is ambiguous for screen-reader users. A Testing Library query caught it.

## Tech

React 18 · TypeScript (strict, `noUncheckedIndexedAccess`) · Vite · Vitest · Testing Library · GitHub Actions → GitHub Pages. There are no UI or state libraries: the charts are CSS, the modal is the native `<dialog>`, and compression uses the built-in `CompressionStream`.

```
src/
├── lib/            pure domain logic, no React
│   ├── money.ts      parsing, formatting, largest-remainder allocation
│   ├── split.ts      the four split modes + validation
│   └── balances.ts   net balances, settle-up plan, spending stats
├── state/
│   ├── reducer.ts    validated actions + undo/redo history
│   ├── persistence.ts localStorage + compressed share links
│   └── store.tsx     React context wiring
└── components/     UI
```

## Running locally

```bash
git clone https://github.com/Tendo505/tally.git
cd tally
npm install
npm run dev      # http://localhost:5173
npm test         # 83 tests: unit, property-based and component
npm run build
```

## Tests

**83 tests** across four suites:

- `money.test.ts`: parsing edge cases, formatting, and allocation, including the 2,000-case property test
- `balances.test.ts`: every split mode, balances, the settle-up heuristic (including a case where exact-matching saves a payment), and the 1,000-case property test
- `reducer.test.ts`: validation rules, undo/redo semantics, corrupt-storage recovery, and share-link round-trips
- `App.test.tsx`: user-level flows with Testing Library in StrictMode, covering creating a group, adding an expense with an invalid then valid split, settling up and undoing, editing and deleting, and keyboard shortcuts

## License

[MIT](LICENSE) © Tendo505
