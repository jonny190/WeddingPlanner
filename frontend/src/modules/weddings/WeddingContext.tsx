import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Wedding, WeddingEvent } from "../../api/types";

const WeddingContext = createContext<Wedding | null>(null);

export function WeddingProvider({ wedding, children }: { wedding: Wedding; children: ReactNode }) {
  return <WeddingContext.Provider value={wedding}>{children}</WeddingContext.Provider>;
}

/** The wedding whose pages are being shown (inside /weddings/:weddingId). */
export function useWedding(): Wedding {
  const wedding = useContext(WeddingContext);
  if (!wedding) throw new Error("useWedding must be used inside a wedding page");
  return wedding;
}

/** The wedding's events in display order. */
export function useEvents(): WeddingEvent[] {
  const wedding = useWedding();
  return useMemo(
    () => [...wedding.events].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [wedding.events],
  );
}
