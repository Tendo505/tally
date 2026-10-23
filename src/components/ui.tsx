import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Category, Group, Id } from "../lib/types";

export const CATEGORY_ICON: Record<Category, string> = {
  food: "🍽️",
  lodging: "🏠",
  transport: "🚕",
  activities: "🎟️",
  groceries: "🛒",
  utilities: "💡",
  other: "🧾",
};

const AVATAR_COLORS = ["#0f766e", "#7c3aed", "#c2410c", "#2563eb", "#be185d", "#4d7c0f", "#b45309", "#0e7490"];

export function Avatar({ name, id }: { name: string; id: Id }) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return <span className="avatar" style={{ background: color }} aria-hidden="true">{initials}</span>;
}

export function memberName(group: Group, id: Id): string {
  return group.members.find((m) => m.id === id)?.name ?? "Someone";
}

// ---------- toast ----------

interface Toast {
  message: string;
  kind: "info" | "error";
  action?: { label: string; run: () => void };
}

const ToastContext = createContext<(t: Toast) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((t: Toast) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), t.action ? 6000 : 3500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind === "error" ? "error" : ""}`} role={toast.kind === "error" ? "alert" : "status"}>
          <span>{toast.message}</span>
          {toast.action && (
            <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
