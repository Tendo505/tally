import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { ActionError, historyReducer, type Action, type AppState, type History } from "./reducer";
import { loadState, saveState } from "./persistence";

interface Store {
  state: AppState;
  /** Apply an action. Returns an error message instead of throwing, for inline display. */
  dispatch: (action: Action) => string | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [history, rawDispatch] = useReducer(historyReducer, undefined, (): History => ({
    past: [], present: initial ?? loadState(), future: [], labels: [],
  }));

  // Keep a ref so dispatch can validate against the latest state synchronously.
  const latest = useRef(history);
  latest.current = history;

  useEffect(() => saveState(history.present), [history.present]);

  const dispatch = useCallback((action: Action): string | null => {
    // Run the reducer once up front to surface validation errors to the caller.
    try {
      historyReducer(latest.current, action);
    } catch (e) {
      if (e instanceof ActionError) return e.message;
      throw e;
    }
    rawDispatch(action);
    return null;
  }, []);

  const undo = useCallback(() => rawDispatch({ type: "undo" }), []);
  const redo = useCallback(() => rawDispatch({ type: "redo" }), []);

  const store = useMemo<Store>(() => ({
    state: history.present,
    dispatch,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoLabel: history.labels[history.labels.length - 1] ?? null,
  }), [history, dispatch, undo, redo]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

export function useActiveGroup() {
  const { state } = useStore();
  return state.groups.find((g) => g.id === state.activeGroupId) ?? null;
}
