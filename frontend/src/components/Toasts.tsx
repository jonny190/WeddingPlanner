import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { errorMessage } from "../api/client";
import { cx } from "../lib/utils";
import { IconButton } from "./Button";
import { Icon } from "./Icon";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  /** Accepts a message or any thrown error (normalised to a readable message). */
  error: (error: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, number>());
  const regionRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId++;
      setToasts((list) => {
        // Avoid stacking identical messages.
        const withoutDup = list.filter((t) => !(t.kind === kind && t.message === message));
        return [...withoutDup, { id, kind, message }].slice(-4);
      });
      timers.current.set(id, window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4500));
    },
    [dismiss],
  );

  const toastApi = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      info: (m) => push("info", m),
      error: (e) => push("error", typeof e === "string" ? e : errorMessage(e)),
    }),
    [push],
  );

  // The region is a manual popover so it sits in the top layer, above open <dialog>s.
  // Re-showing it moves it to the top of the stack after a dialog opens.
  useEffect(() => {
    const region = regionRef.current;
    if (!region || typeof region.showPopover !== "function") return;
    try {
      if (region.matches(":popover-open")) region.hidePopover();
      if (toasts.length > 0) region.showPopover();
    } catch {
      // Popover unsupported: the region still shows as a fixed element.
    }
  }, [toasts]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      <div ref={regionRef} className="toast-region" popover="manual" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={cx("toast", `toast-${t.kind}`)} role={t.kind === "error" ? "alert" : undefined}>
            <Icon
              className="toast-icon"
              name={t.kind === "success" ? "checkCircle" : t.kind === "error" ? "alert" : "info"}
            />
            <div className="toast-msg">{t.message}</div>
            <IconButton icon="close" label="Dismiss" onClick={() => dismiss(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
