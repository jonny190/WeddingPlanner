// Controls for the envelope guests open first, with the real envelope playing alongside.
import { useId, useMemo, useState } from "react";
import { EnvelopeReveal, sealInitials } from "../../../components/envelope/EnvelopeReveal";
import { ColorField, cx, Field, Section, Switch, useElementWidth } from "./controls";
import { useWebFonts } from "./fonts";
import type { EnvelopeStyleEditorProps } from "./index";
import { charCount, isHex, MAX_HINT, MAX_INITIALS, MAX_STAMP, normalizeEnvelope, truncateChars } from "./model";
import type { EnvelopeStyle } from "./types";

const PAPER_SWATCHES = ["#e9d9bd", "#f3e9d6", "#d9c7a6", "#efe3cf", "#e4d4c2", "#cfc3b4"];
const WAX_SWATCHES = ["#7a1f2b", "#8e1b1b", "#7a5c4f", "#1f3d2b", "#1f2a44", "#b08d57", "#3b302a"];
const INK_SWATCHES = ["#1f5436", "#223355", "#3b302a", "#5a1f2b", "#2b241c"];

export function EnvelopeStyleEditor({
  value,
  onChange,
  accentColor,
  paperColor,
  coupleNames,
  weddingDate,
  fonts,
  readOnly,
}: EnvelopeStyleEditorProps) {
  useWebFonts(fonts);
  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const [replay, setReplay] = useState(0);
  const [hintDraft, setHintDraft] = useState<string | null>(null);
  const hintId = useId();
  const initialsId = useId();
  const stampId = useId();
  const stacked = width > 0 && width < 640;

  const set = (patch: Partial<EnvelopeStyle>) => {
    if (readOnly) return;
    onChange(normalizeEnvelope({ ...value, ...patch }));
  };

  const defaultInitials = sealInitials(coupleNames);
  const initials = value.initials.trim() || defaultInitials;
  const seal = value.seal_color ?? accentColor;
  const paper = value.paper_color ?? paperColor;
  const hint = hintDraft ?? value.hint;
  const hintEmpty = !hint.trim();
  const swatches = (base: readonly string[], ...extra: (string | null)[]) => {
    const out: string[] = [];
    for (const c of [...extra, ...base]) {
      const v = c?.toLowerCase();
      if (v && isHex(v) && !out.includes(v)) out.push(v);
    }
    return out.slice(0, 10);
  };
  const addressLines = useMemo(
    () => ["Alex Example", `The wedding of ${coupleNames}`, ...(weddingDate ? [weddingDate] : [])],
    [coupleNames, weddingDate],
  );

  return (
    <div ref={rootRef} className={cx("dz-root dz-envelope", stacked && "dz-is-stacked")}>
      <fieldset className="dz-envelope-controls" disabled={readOnly}>
        <legend className="dz-visually-hidden">Envelope</legend>

        <Section title="Envelope">
          <Switch
            checked={value.enabled}
            onChange={(enabled) => set({ enabled })}
            label="Guests open a sealed envelope before the letter"
          />
          <p className="dz-hint">
            It arrives addressed to them, turns over to the wax seal, and opens when they tap it. Switched off, the
            letter is simply shown.
          </p>
        </Section>

        <Section title="Colours">
          <div className="dz-color-grid">
            <ColorField
              label="Paper"
              value={paper}
              swatches={swatches(PAPER_SWATCHES, paperColor)}
              onChange={(paper_color) => set({ paper_color })}
            />
            <ColorField
              label="Wax seal"
              value={seal}
              swatches={swatches(WAX_SWATCHES, accentColor)}
              onChange={(seal_color) => set({ seal_color })}
            />
            <ColorField
              label="Ink"
              value={value.ink_color}
              swatches={swatches(INK_SWATCHES)}
              onChange={(ink_color) => set({ ink_color })}
            />
          </div>
          <div className="dz-row dz-wrap">
            {value.paper_color && (
              <button type="button" className="dz-btn dz-btn-sm" onClick={() => set({ paper_color: null })}>
                Paper: follow the card
              </button>
            )}
            {value.seal_color && (
              <button type="button" className="dz-btn dz-btn-sm" onClick={() => set({ seal_color: null })}>
                Wax: follow the email accent
              </button>
            )}
          </div>
          <p className="dz-hint">
            Unless you pick them, the paper follows the card's background and the wax the email's accent colour. The
            ink is used for the address on the envelope and for the headings and signature on the letter.
          </p>
        </Section>

        <Section title="Wax and stamp">
          <div className="dz-color-grid">
            <Field label="Initials on the wax" htmlFor={initialsId} hint={`Blank means ${defaultInitials}.`}>
              <input
                id={initialsId}
                className="dz-input"
                value={value.initials}
                maxLength={MAX_INITIALS}
                placeholder={defaultInitials}
                onChange={(e) => set({ initials: truncateChars(e.target.value, MAX_INITIALS) })}
              />
            </Field>
            <Field label="Stamp" htmlFor={stampId} hint="Blank means the initials. A year works well.">
              <input
                id={stampId}
                className="dz-input"
                value={value.stamp_text}
                maxLength={MAX_STAMP}
                placeholder={initials}
                onChange={(e) => set({ stamp_text: truncateChars(e.target.value, MAX_STAMP) })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Prompt">
          <Field label="Under the envelope" htmlFor={hintId}>
            <input
              id={hintId}
              className="dz-input"
              value={hint}
              maxLength={MAX_HINT}
              aria-invalid={hintEmpty || undefined}
              aria-describedby={`${hintId}-help`}
              onChange={(e) => {
                const text = e.target.value;
                setHintDraft(text);
                if (text.trim()) set({ hint: truncateChars(text, MAX_HINT) });
              }}
              onBlur={() => setHintDraft(null)}
            />
          </Field>
          <div className="dz-foot-row" id={`${hintId}-help`}>
            <span className={hintEmpty ? "dz-error" : "dz-hint"}>
              {hintEmpty ? "The prompt needs some text; your last text is kept." : "Shown beneath the sealed envelope."}
            </span>
            <span className="dz-count">
              {charCount(hint)}/{MAX_HINT}
            </span>
          </div>
        </Section>
      </fieldset>

      <figure className="dz-envelope-preview-wrap">
        <figcaption className="dz-section-title dz-row dz-between">
          <span>Preview</span>
          <button type="button" className="dz-btn dz-btn-sm" onClick={() => setReplay((n) => n + 1)}>
            Play again
          </button>
        </figcaption>
        <div className="dz-envelope-preview">
          {value.enabled ? (
            <EnvelopeReveal
              key={replay}
              play
              initials={initials}
              stampText={value.stamp_text.trim() || undefined}
              hint={value.hint}
              addressLines={addressLines}
              sealColor={seal}
              paperColor={paper}
              inkColor={value.ink_color}
            >
              <div className="dz-envelope-letter" style={{ color: value.ink_color }}>
                <span className="dz-envelope-letter-eyebrow">The wedding of</span>
                <span className="dz-envelope-letter-names">{coupleNames}</span>
                <span className="dz-envelope-letter-note">The guest's letter and reply slip follow here.</span>
              </div>
            </EnvelopeReveal>
          ) : (
            <p className="dz-hint dz-envelope-off">The envelope is switched off, so guests go straight to the letter.</p>
          )}
        </div>
      </figure>
    </div>
  );
}
