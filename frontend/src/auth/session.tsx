import { useQueryClient } from "@tanstack/react-query";
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
import { api, isApiError, onUnauthorized, request, sessionStore } from "../api/client";
import type {
  LoginRequest,
  MeResponse,
  Role,
  SessionResponse,
  SignupRequest,
  Tenant,
  User,
} from "../api/types";
import { useToast } from "../components/Toasts";
import { canEdit, isAdmin } from "./permissions";

export type SessionStatus = "loading" | "authenticated" | "anonymous" | "error";

interface SessionState {
  status: SessionStatus;
  user: User | null;
  tenants: Tenant[];
  tenantId: string | null;
  error: unknown;
}

export interface SessionValue {
  status: SessionStatus;
  user: User | null;
  tenants: Tenant[];
  currentTenant: Tenant | null;
  role: Role | null;
  /** Editors and above can change data; viewers are read-only. */
  canEdit: boolean;
  /** Owners and admins manage the account and its members. */
  isAdmin: boolean;
  error: unknown;
  login: (input: LoginRequest) => Promise<void>;
  signup: (input: SignupRequest) => Promise<void>;
  logout: () => void;
  switchTenant: (tenantId: string) => void;
  /** Re-read the user and their accounts (after creating or renaming one). */
  refresh: () => Promise<void>;
  retry: () => void;
}

const ANONYMOUS: SessionState = { status: "anonymous", user: null, tenants: [], tenantId: null, error: null };

const SessionContext = createContext<SessionValue | null>(null);

function pickTenant(tenants: Tenant[], preferred?: string | null): Tenant | null {
  const wanted = preferred ?? sessionStore.getTenantId();
  return tenants.find((t) => t.id === wanted) ?? tenants[0] ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<SessionState>(() =>
    sessionStore.getToken() ? { ...ANONYMOUS, status: "loading" } : ANONYMOUS,
  );
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  const apply = useCallback((user: User, tenants: Tenant[], preferredTenant?: string | null) => {
    const tenant = pickTenant(tenants, preferredTenant);
    sessionStore.setTenantId(tenant?.id ?? null);
    setState({ status: "authenticated", user, tenants, tenantId: tenant?.id ?? null, error: null });
  }, []);

  const load = useCallback(async () => {
    if (!sessionStore.getToken()) {
      setState(ANONYMOUS);
      return;
    }
    setState((s) => ({ ...s, status: s.status === "authenticated" ? s.status : "loading", error: null }));
    try {
      const me = await api.get<MeResponse>("/auth/me");
      apply(me.user, me.tenants);
    } catch (error) {
      if (isApiError(error, 401)) {
        sessionStore.clear();
        setState(ANONYMOUS);
      } else {
        setState((s) => ({ ...s, status: "error", error }));
      }
    }
  }, [apply]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      onUnauthorized(() => {
        const wasSignedIn = statusRef.current === "authenticated";
        sessionStore.clear();
        qc.clear();
        setState(ANONYMOUS);
        if (wasSignedIn) toast.info("Your session has expired. Please sign in again.");
      }),
    [qc, toast],
  );

  const startSession = useCallback(
    (res: SessionResponse) => {
      sessionStore.setToken(res.access_token);
      qc.clear();
      apply(res.user, res.tenants);
    },
    [apply, qc],
  );

  const login = useCallback(
    async (input: LoginRequest) => {
      const res = await request<SessionResponse>("/auth/login", { method: "POST", body: input, auth: false });
      startSession(res);
    },
    [startSession],
  );

  const signup = useCallback(
    async (input: SignupRequest) => {
      const res = await request<SessionResponse>("/auth/signup", { method: "POST", body: input, auth: false });
      // A new account: make it the current one.
      sessionStore.setTenantId(res.tenants[0]?.id ?? null);
      startSession(res);
    },
    [startSession],
  );

  const logout = useCallback(() => {
    sessionStore.clear();
    qc.clear();
    setState(ANONYMOUS);
  }, [qc]);

  const switchTenant = useCallback(
    (tenantId: string) => {
      sessionStore.setTenantId(tenantId);
      qc.clear();
      setState((s) => ({ ...s, tenantId }));
    },
    [qc],
  );

  const refresh = useCallback(async () => {
    const me = await api.get<MeResponse>("/auth/me");
    setState((s) => {
      const tenant = pickTenant(me.tenants, s.tenantId);
      sessionStore.setTenantId(tenant?.id ?? null);
      return { ...s, status: "authenticated", user: me.user, tenants: me.tenants, tenantId: tenant?.id ?? null };
    });
  }, []);

  const value = useMemo<SessionValue>(() => {
    const currentTenant = state.tenants.find((t) => t.id === state.tenantId) ?? null;
    const role = currentTenant?.role ?? null;
    return {
      status: state.status,
      user: state.user,
      tenants: state.tenants,
      currentTenant,
      role,
      canEdit: canEdit(role),
      isAdmin: isAdmin(role),
      error: state.error,
      login,
      signup,
      logout,
      switchTenant,
      refresh,
      retry: () => void load(),
    };
  }, [state, login, signup, logout, switchTenant, refresh, load]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
