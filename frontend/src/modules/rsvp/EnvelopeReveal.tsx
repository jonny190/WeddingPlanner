import { useCallback, useEffect, useState, type ReactNode } from "react";
import "./envelope.css";

type Stage = "sealed" | "opening" | "open";

// The seal gives first, then the flap swings back, and the card takes its place as both finish.
// Kept in step with the transitions in envelope.css.
const SEAL_MS = 450;
const FLAP_MS = 800;

const opened = new Set<string>();

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** True once per browser session, so a guest who has already opened the invitation is not asked to again. */
export function shouldReveal(key: string): boolean {
  if (reducedMotion()) return false;
  // The same page can ask twice (a re-render); the answer must not change between the two.
  if (opened.has(key)) return true;
  try {
    if (window.sessionStorage.getItem(`envelope:${key}`)) return false;
    window.sessionStorage.setItem(`envelope:${key}`, "1");
    opened.add(key);
    return true;
  } catch {
    // Storage can be unavailable (private mode); then simply open the invitation straight away.
    return false;
  }
}

/** The couple's initials for the wax: "Alexandra & Jonathan" becomes "A&J". */
export function sealInitials(coupleNames: string): string {
  // Word boundaries matter: without them "Alexandra" splits on its own "and".
  const parts = coupleNames
    .split(/\s*(?:[&+]|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const letters = parts.map((part) => Array.from(part)[0] ?? "").filter(Boolean);
  if (letters.length >= 2) return `${letters[0]}&${letters[1]}`.toUpperCase();
  return letters.join("").toUpperCase();
}

interface Props {
  children: ReactNode;
  /** False for a guest who has opened it before, or whose device asks for reduced motion. */
  play: boolean;
  initials?: string;
  hint?: string;
}

/**
 * The invitation arrives as a sealed envelope. One tap breaks the wax, the flap swings back in
 * three dimensions, and the card rises into place underneath. Everything is drawn from the app's
 * tokens, so a themed account carries the effect with it.
 */
export function EnvelopeReveal({ children, play, initials = "", hint = "Tap the seal to open" }: Props) {
  const [stage, setStage] = useState<Stage>(play ? "sealed" : "open");

  useEffect(() => {
    if (stage !== "opening") return;
    const timer = window.setTimeout(() => setStage("open"), SEAL_MS + FLAP_MS);
    return () => window.clearTimeout(timer);
  }, [stage]);

  const open = useCallback(
    () => setStage((current) => (current === "sealed" ? "opening" : current)),
    [],
  );

  return (
    <div className={`reveal reveal-${stage}`}>
      <div className="reveal-envelope" aria-hidden={stage !== "sealed"}>
        <button
          type="button"
          className="envelope"
          onClick={open}
          disabled={stage !== "sealed"}
          aria-label="Open the invitation"
        >
          <span className="envelope__back" aria-hidden="true" />
          <span className="envelope__letter" aria-hidden="true" />
          <span className="envelope__pocket" aria-hidden="true" />
          <span className="envelope__flap" aria-hidden="true" />
          {initials && (
            <span className="seal" aria-hidden="true">
              {initials}
            </span>
          )}
        </button>
        <p className="reveal-hint">{hint}</p>
      </div>
      <div className="reveal-card">{children}</div>
    </div>
  );
}
