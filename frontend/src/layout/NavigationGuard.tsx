// Unsaved-changes protection. Library-mode React Router has no navigation blocker,
// so in-app links that leave a page consult this guard before navigating.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import { NavLink, useNavigate, type NavLinkProps, type To } from "react-router-dom";
import { useConfirm } from "../components/ConfirmDialog";

interface GuardApi {
  register: (key: symbol, message: string) => void;
  unregister: (key: symbol) => void;
  /** Resolves true when there is nothing unsaved, or the user agrees to discard it. */
  confirmLeave: () => Promise<boolean>;
}

const GuardContext = createContext<GuardApi | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const confirm = useConfirm();
  const blockers = useRef(new Map<symbol, string>());

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (blockers.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const api = useMemo<GuardApi>(
    () => ({
      register: (key, message) => {
        blockers.current.set(key, message);
      },
      unregister: (key) => {
        blockers.current.delete(key);
      },
      confirmLeave: async () => {
        if (blockers.current.size === 0) return true;
        const message = [...blockers.current.values()][0];
        return confirm({
          title: "Discard unsaved changes?",
          message,
          confirmLabel: "Discard changes",
          cancelLabel: "Keep editing",
          tone: "danger",
        });
      },
    }),
    [confirm],
  );

  return <GuardContext.Provider value={api}>{children}</GuardContext.Provider>;
}

function useGuard(): GuardApi {
  const ctx = useContext(GuardContext);
  if (!ctx) throw new Error("Navigation guard used outside <NavigationGuardProvider>");
  return ctx;
}

/** Warn before leaving while `dirty` is true (in-app navigation and closing the tab). */
export function useUnsavedChanges(
  dirty: boolean,
  message = "You have unsaved changes. If you leave now, they will be lost.",
) {
  const guard = useGuard();
  const key = useRef(Symbol("unsaved"));
  useEffect(() => {
    const k = key.current;
    if (dirty) guard.register(k, message);
    else guard.unregister(k);
    return () => guard.unregister(k);
  }, [dirty, message, guard]);
}

/** Run `action` only if there are no unsaved changes, or the user agrees to discard them. */
export function useGuardedAction() {
  const guard = useGuard();
  return useCallback(
    async (action: () => void) => {
      if (await guard.confirmLeave()) action();
    },
    [guard],
  );
}

export function useGuardedNavigate() {
  const navigate = useNavigate();
  const guarded = useGuardedAction();
  return useCallback(
    (to: To, options?: { replace?: boolean }) => guarded(() => navigate(to, options)),
    [guarded, navigate],
  );
}

/** A NavLink that asks before leaving unsaved changes behind. */
export function GuardedNavLink({ onClick, to, ...props }: NavLinkProps) {
  const guard = useGuard();
  const navigate = useNavigate();
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void guard.confirmLeave().then((ok) => {
      if (ok) navigate(to);
    });
  };
  return <NavLink to={to} onClick={handleClick} {...props} />;
}
