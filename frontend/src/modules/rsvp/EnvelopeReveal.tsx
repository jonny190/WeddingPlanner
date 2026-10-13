import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./envelope.css";

type Stage = "addressed" | "sealed" | "opening" | "open" | "done";

// The envelope lands address-up and turns itself over to show the seal. Then: the seal cracks,
// the flap swings back, the letter rises out of the pocket, and the envelope drops away as the
// letter settles into the page. Kept in step with envelope.css.
const ADDRESS_MS = 1700; // how long the guest reads their name before the envelope turns over
const SEAL_MS = 420;
const FLAP_MS = 760;
const RISE_MS = 820;
const OPEN_AT = SEAL_MS + FLAP_MS * 0.7 + RISE_MS; // the letter has risen: hand it to the page
const SETTLE_MS = 820; // the letter growing into place while the envelope falls away

const opened = new Set<string>();

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  /** What is written on the front of the envelope, one line each: the guest, the occasion, the date. */
  addressLines?: string[];
  /** The wax colour, normally the invitation's accent so the seal matches the card. */
  sealColor?: string;
  /** A tint for the envelope paper, normally the card's background colour. */
  paperColor?: string;
}

/**
 * The invitation arrives as a sealed envelope with the whole letter inside it. One tap breaks
 * the wax, the flap swings back, the letter rises out of the pocket and then grows into the
 * page while the envelope falls away. The letter is the real content throughout, so nothing
 * is swapped or re-rendered: what rises out of the envelope is what the guest then reads.
 */
export function EnvelopeReveal({
  children,
  play,
  initials = "",
  hint = "Break the seal to open",
  addressLines = [],
  sealColor,
  paperColor,
}: Props) {
  const [stage, setStage] = useState<Stage>(play ? "addressed" : "done");
  const sheetRef = useRef<HTMLDivElement>(null);
  // Where the letter was, the moment before the page took it back (for the settle animation).
  const lastInEnvelope = useRef<DOMRect | null>(null);

  useEffect(() => {
    if (stage === "addressed") {
      const timer = window.setTimeout(() => setStage("sealed"), ADDRESS_MS);
      return () => window.clearTimeout(timer);
    }
    if (stage === "opening") {
      const timer = window.setTimeout(() => {
        lastInEnvelope.current = sheetRef.current?.getBoundingClientRect() ?? null;
        setStage("open");
      }, OPEN_AT);
      return () => window.clearTimeout(timer);
    }
    if (stage === "open") {
      const timer = window.setTimeout(() => setStage("done"), SETTLE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [stage]);

  // The letter leaves the envelope's coordinate space and joins the page: animate between the two
  // positions rather than letting it jump (a FLIP: measure first, measure last, play the difference).
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const first = lastInEnvelope.current;
    if (stage !== "open" || !sheet || !first) return;
    lastInEnvelope.current = null;
    const last = sheet.getBoundingClientRect();
    if (last.width === 0) return;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const scale = first.width / last.width;
    const settle = sheet.animate(
      [
        { transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
        { transformOrigin: "top left", transform: "none" },
      ],
      { duration: SETTLE_MS, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "both" },
    );
    // Once settled the letter is simply in the page; nothing should keep holding a transform on it.
    settle.onfinish = () => settle.cancel();
  }, [stage]);

  const turnOver = useCallback(() => setStage((current) => (current === "addressed" ? "sealed" : current)), []);
  const open = useCallback(() => setStage((current) => (current === "sealed" ? "opening" : current)), []);

  const style = {
    ...(sealColor ? { "--seal-color": sealColor } : {}),
    ...(paperColor ? { "--paper-tint": paperColor } : {}),
  } as CSSProperties;
  const sealed = stage === "sealed";
  const inEnvelope = stage === "addressed" || stage === "sealed" || stage === "opening";

  return (
    <div className={`reveal reveal-${stage}`} style={style}>
      {/* The seal side of the envelope and the letter inside it, turned over together. */}
      <div className="env-scene">
        {stage !== "done" && <div className="env-back" aria-hidden="true" />}
        <div className="reveal-window">
          {/* While it is in the envelope the letter is there to be seen through the flap, but not to be read or tabbed to. */}
          <div ref={sheetRef} className="reveal-sheet" inert={inEnvelope || undefined} aria-hidden={inEnvelope || undefined}>
            {children}
          </div>
        </div>
        {stage !== "done" && (
          <div className="env-front" aria-hidden={!sealed || undefined}>
            <span className="env-pocket" aria-hidden="true" />
            <span className="env-flap" aria-hidden="true" />
            <button type="button" className="seal" onClick={open} disabled={!sealed} aria-label="Open the invitation">
              <span className="seal__half seal__half--left" aria-hidden="true">
                {initials}
              </span>
              <span className="seal__half seal__half--right" aria-hidden="true">
                {initials}
              </span>
              <span className="seal__drip" aria-hidden="true" />
            </button>
            <p className="reveal-hint">{hint}</p>
          </div>
        )}
      </div>
      {(stage === "addressed" || stage === "sealed") && (
        <button
          type="button"
          className="env-address"
          onClick={turnOver}
          disabled={stage !== "addressed"}
          aria-label="Turn the envelope over"
        >
          <span className="env-stamp" aria-hidden="true">
            {initials}
          </span>
          <span className="env-postmark" aria-hidden="true" />
          <span className="env-address-lines">
            {addressLines.map((line, i) => (
              <span key={i} className={i === 0 ? "env-to" : "env-line"}>
                {line}
              </span>
            ))}
          </span>
        </button>
      )}
    </div>
  );
}
