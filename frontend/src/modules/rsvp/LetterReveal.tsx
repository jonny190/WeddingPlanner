import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./letter.css";

type Stage = "sealed" | "flap" | "unfold" | "open";

/** How long each stage holds before the next one begins. */
const HOLD_MS: Record<Exclude<Stage, "open">, number> = { sealed: 480, flap: 640, unfold: 680 };

/** At most one reveal per event per page load, so a re-render cannot cancel the animation. */
const granted = new Set<string>();

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const NEXT: Record<Exclude<Stage, "open">, Stage> = { sealed: "flap", flap: "unfold", unfold: "open" };

/**
 * Whether this visit should see the letter unfold. True once per browser session per key, so a
 * guest who comes back to the same invitation later goes straight to the card. Anyone who has
 * asked their device for reduced motion never sees it at all.
 */
export function shouldReveal(key: string): boolean {
  if (reducedMotion()) return false;
  if (granted.has(key)) return true;
  try {
    const slot = `letter-reveal:${key}`;
    if (window.sessionStorage.getItem(slot)) return false;
    window.sessionStorage.setItem(slot, "1");
    granted.add(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reveals its children as a folded letter: the seal gives, both folds swing away, and the card
 * settles flat. Tapping the letter skips straight to the card.
 */
export function LetterReveal({
  children,
  play,
  skipLabel = "Skip",
}: {
  children: ReactNode;
  play: boolean;
  skipLabel?: string;
}) {
  const [stage, setStage] = useState<Stage>(play ? "sealed" : "open");

  useEffect(() => {
    if (stage === "open") return;
    const timer = window.setTimeout(() => setStage(NEXT[stage]), HOLD_MS[stage]);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const skip = useCallback(() => setStage("open"), []);
  const opening = stage !== "open";

  return (
    <div className={`letter letter-${stage}`} onClick={opening ? skip : undefined}>
      <div className="letter-stage">{children}</div>
      {opening && (
        <>
          <div className="letter-fold letter-fold-top" aria-hidden="true" />
          <div className="letter-fold letter-fold-bottom" aria-hidden="true" />
          <div className="letter-seal" aria-hidden="true" />
          <p className="letter-hint" role="status">
            Unfolding your invitation…
            <button
              type="button"
              className="letter-skip"
              onClick={(event) => {
                event.stopPropagation();
                skip();
              }}
            >
              {skipLabel}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
