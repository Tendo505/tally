import { render as rtlRender, screen, within } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { sampleGroup } from "./lib/sample";
import { initialState } from "./state/reducer";

const withSample = () => ({ groups: [{ ...sampleGroup(), id: "g1" }], activeGroupId: "g1" });

beforeEach(() => localStorage.clear());

// Render exactly as main.tsx does, so StrictMode double-effects are exercised.
const render = (ui: ReactElement) => rtlRender(<StrictMode>{ui}</StrictMode>);

describe("Tally app", () => {
  it("creates a group from the welcome screen", async () => {
    const user = userEvent.setup();
    render(<App initialState={initialState} />);

    await user.type(screen.getByLabelText("Group name"), "Flat 4B");
    await user.type(screen.getByLabelText(/People/), "Aisha, Ben, Chen");
    await user.click(screen.getByRole("button", { name: "Create group" }));

    expect(screen.getByRole("heading", { name: "Flat 4B", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
    expect(screen.getByText("✓ Everyone is settled up")).toBeInTheDocument();
  });

  it("shows validation errors when creating a group", async () => {
    const user = userEvent.setup();
    render(<App initialState={initialState} />);
    await user.click(screen.getByRole("button", { name: "Create group" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the group a name");
  });

  it("adds an expense with an exact split, catching an amount that doesn't add up", async () => {
    const user = userEvent.setup();
    render(<App initialState={initialState} />);
    await user.type(screen.getByLabelText("Group name"), "Dinner club");
    await user.type(screen.getByLabelText(/People/), "Ana, Ben");
    await user.click(screen.getByRole("button", { name: "Create group" }));

    await user.click(screen.getByRole("button", { name: "+ Add expense" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Description"), "Sushi");
    await user.type(within(dialog).getByLabelText(/Amount/), "50");
    await user.click(within(dialog).getByRole("tab", { name: "Amounts" }));
    await user.type(within(dialog).getByLabelText("Ana amount"), "30");
    await user.type(within(dialog).getByLabelText("Ben amount"), "10");

    expect(within(dialog).getByRole("alert")).toHaveTextContent("$10.00 left to assign");

    await user.clear(within(dialog).getByLabelText("Ben amount"));
    await user.type(within(dialog).getByLabelText("Ben amount"), "20");
    expect(within(dialog).getByText("✓ Adds up to $50.00")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Add expense" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Sushi" })).toBeInTheDocument();
    // Ana paid 50 and owes 30, so she is owed 20; Ben owes 20.
    expect(screen.getByLabelText("Ana is owed $20.00")).toBeInTheDocument();
    expect(screen.getByLabelText("Ben owes $20.00")).toBeInTheDocument();
    expect(screen.getByText("Ben", { selector: "b" }).closest(".transfer")).toHaveTextContent("Ben pays Ana$20.00");
  });

  it("settles up the sample trip and can undo it", async () => {
    const user = userEvent.setup();
    render(<App initialState={withSample()} />);

    const settle = screen.getByRole("region", { name: /Settle up/ });
    const buttons = within(settle).getAllByRole("button", { name: /^Mark .* paid/ });
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.length).toBeLessThanOrEqual(3); // 4 people: at most n - 1 payments

    while (within(settle).queryAllByRole("button", { name: /^Mark .* paid/ }).length > 0) {
      await user.click(within(settle).getAllByRole("button", { name: /^Mark .* paid/ })[0]!);
    }
    expect(within(settle).getByText("✓ Everyone is settled up")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(within(settle).queryByText("✓ Everyone is settled up")).not.toBeInTheDocument();
  });

  it("edits and deletes an expense, with undo restoring it", async () => {
    const user = userEvent.setup();
    render(<App initialState={withSample()} />);

    await user.click(screen.getByRole("button", { name: "Edit Airport taxi" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Airport taxi");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: "Edit Airport taxi" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getByRole("button", { name: "Edit Airport taxi" })).toBeInTheDocument();
  });

  it("won't remove someone who is part of an expense", async () => {
    const user = userEvent.setup();
    render(<App initialState={withSample()} />);
    await user.click(screen.getByRole("button", { name: "Remove Ben" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/part of existing expenses/);
    expect(screen.getByRole("button", { name: "Remove Ben" })).toBeInTheDocument();
  });

  it("opens the add-expense dialog with the N shortcut", async () => {
    const user = userEvent.setup();
    render(<App initialState={withSample()} />);
    await user.keyboard("n");
    expect(screen.getByRole("dialog", { name: "Add an expense" })).toBeInTheDocument();
  });

  it("persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<App initialState={withSample()} />);
    await user.click(screen.getByRole("button", { name: "Remove Ben" })); // a no-op error, but state is saved on mount
    const saved = JSON.parse(localStorage.getItem("tally:v1")!);
    expect(saved.groups[0].name).toBe("Lisbon trip");
  });
});
