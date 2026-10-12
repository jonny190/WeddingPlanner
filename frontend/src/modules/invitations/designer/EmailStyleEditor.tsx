// Controls for the invitation email's look, with a live mini-preview of its top.
import { useId, useMemo, useState } from "react";
import { AssetPicker } from "./AssetPicker";
import { ColorField, cx, Field, Section, Switch, useElementWidth } from "./controls";
import { FontPicker } from "./FontPicker";
import { fallbackOnlyStack, findFont, fontStack, useWebFonts } from "./fonts";
import { IconImage } from "./icons";
import type { EmailStyleEditorProps } from "./index";
import { charCount, isHex, MAX_BUTTON_TEXT, normalizeEmail, truncateChars } from "./model";
import type { EmailStyle } from "./types";

const EMAIL_SWATCHES = ["#f6f1eb", "#ffffff", "#3b302a", "#7a5c4f", "#b08d57", "#c98f8a", "#9caf88", "#1f2a44"];

/** Controls for the email's look: header image, colours, font, button text. */
export function EmailStyleEditor({
  value,
  onChange,
  fonts,
  assets,
  onUploadImage,
  assetUrl,
  readOnly,
}: EmailStyleEditorProps) {
  useWebFonts(fonts);
  const [rootRef, width] = useElementWidth<HTMLDivElement>();
  const [picker, setPicker] = useState(false);
  const [fallbackPreview, setFallbackPreview] = useState(false);
  const [buttonDraft, setButtonDraft] = useState<string | null>(null);
  const fontId = useId();
  const buttonId = useId();
  const stacked = width > 0 && width < 640;

  const set = (patch: Partial<EmailStyle>) => {
    if (readOnly) return;
    onChange(normalizeEmail({ ...value, ...patch }, fonts));
  };

  const swatches = useMemo(() => {
    const out: string[] = [];
    for (const c of [value.background_color, value.card_color, value.text_color, value.accent_color, ...EMAIL_SWATCHES]) {
      const v = c?.toLowerCase();
      if (v && isHex(v) && !out.includes(v)) out.push(v);
    }
    return out.slice(0, 10);
  }, [value.background_color, value.card_color, value.text_color, value.accent_color]);

  const font = findFont(fonts, value.font_family);
  const stack = fontStack(value.font_family, fonts);
  const bodyStack = fallbackPreview ? fallbackOnlyStack(stack) : stack;
  const buttonStackFull = fontStack("Montserrat", fonts);
  const buttonStack = fallbackPreview ? fallbackOnlyStack(buttonStackFull) : buttonStackFull;
  const fallbackName = fallbackOnlyStack(stack).split(",")[0]?.replace(/['"]/g, "").trim();

  const buttonText = buttonDraft ?? value.button_text;
  const buttonEmpty = !buttonText.trim();
  const header = value.header_asset_id;
  const headerAsset = header ? assets.find((a) => a.id === header) : undefined;

  return (
    <div ref={rootRef} className={cx("dz-root dz-email", stacked && "dz-is-stacked")}>
      <fieldset className="dz-email-controls" disabled={readOnly}>
        <legend className="dz-visually-hidden">Email style</legend>

        <Section title="Header image">
          <p className="dz-hint">
            Appears across the top of the email, above your message. Wide images (around 3:1) work best.
          </p>
          {header ? (
            <div className="dz-bg-image">
              <img className="dz-bg-thumb dz-header-thumb" src={assetUrl(header)} alt="" draggable={false} />
              <div className="dz-bg-image-actions">
                {headerAsset && <span className="dz-hint dz-truncate">{headerAsset.filename}</span>}
                <div className="dz-row">
                  <button type="button" className="dz-btn dz-btn-sm" onClick={() => setPicker(true)}>
                    Change
                  </button>
                  <button
                    type="button"
                    className="dz-btn dz-btn-sm dz-btn-danger-ghost"
                    onClick={() => set({ header_asset_id: null })}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="dz-btn dz-btn-block" onClick={() => setPicker(true)}>
              <IconImage />
              <span>Add header image</span>
            </button>
          )}
        </Section>

        <Section title="Colours">
          <div className="dz-color-grid">
            <ColorField
              label="Page background"
              value={value.background_color}
              swatches={swatches}
              onChange={(background_color) => set({ background_color })}
            />
            <ColorField
              label="Message card"
              value={value.card_color}
              swatches={swatches}
              onChange={(card_color) => set({ card_color })}
            />
            <ColorField
              label="Text"
              value={value.text_color}
              swatches={swatches}
              onChange={(text_color) => set({ text_color })}
            />
            <ColorField
              label="Accent (button)"
              value={value.accent_color}
              swatches={swatches}
              onChange={(accent_color) => set({ accent_color })}
            />
          </div>
        </Section>

        <Section title="Font">
          <Field
            label="Font"
            htmlFor={fontId}
            hint={
              <>
                Most email clients can't load web fonts, so many guests will see a similar fallback
                {fallbackName ? ` (such as ${fallbackName})` : ""}. Your card on the RSVP page always uses the real
                font.
              </>
            }
          >
            <FontPicker
              id={fontId}
              label="Email font"
              value={value.font_family}
              fonts={fonts}
              onChange={(font_family) => set({ font_family })}
            />
          </Field>
        </Section>

        <Section title="Button">
          <Field label="Button text" htmlFor={buttonId}>
            <input
              id={buttonId}
              className="dz-input"
              value={buttonText}
              maxLength={MAX_BUTTON_TEXT}
              aria-invalid={buttonEmpty || undefined}
              aria-describedby={`${buttonId}-help`}
              onChange={(e) => {
                const text = e.target.value;
                setButtonDraft(text);
                if (text.trim()) set({ button_text: truncateChars(text, MAX_BUTTON_TEXT) });
              }}
              onBlur={() => setButtonDraft(null)}
            />
          </Field>
          <div className="dz-foot-row" id={`${buttonId}-help`}>
            <span className={buttonEmpty ? "dz-error" : "dz-hint"}>
              {buttonEmpty
                ? "The button needs some text; your last text is kept."
                : "The button opens the guest's personal invitation page."}
            </span>
            <span className="dz-count">
              {charCount(buttonText)}/{MAX_BUTTON_TEXT}
            </span>
          </div>
        </Section>
      </fieldset>

      <figure className="dz-email-preview-wrap">
        <figcaption className="dz-section-title">Preview</figcaption>
        <div className="dz-email-preview" style={{ backgroundColor: value.background_color }}>
          <div className="dz-email-frame">
            {header && <img className="dz-email-header" src={assetUrl(header)} alt="" draggable={false} />}
            <div
              className="dz-email-card"
              style={{
                backgroundColor: value.card_color,
                color: value.text_color,
                fontFamily: bodyStack,
                borderRadius: header ? "0 0 10px 10px" : 10,
              }}
            >
              <p>Dear Alex,</p>
              <p>Sam &amp; Jordan would love you to join them on their wedding day.</p>
              <span className="dz-email-button" style={{ backgroundColor: value.accent_color, fontFamily: buttonStack }}>
                {value.button_text}
              </span>
            </div>
          </div>
        </div>
        <Switch
          checked={fallbackPreview}
          onChange={setFallbackPreview}
          label="Show the fallback font"
          disabled={!font}
        />
      </figure>

      {picker && (
        <AssetPicker
          title="Email header image"
          description="Shown across the top of the invitation email. Wide images (around 3:1) work best."
          assets={assets}
          assetUrl={assetUrl}
          onUploadImage={onUploadImage}
          selectedId={header}
          onPick={(id) => {
            setPicker(false);
            set({ header_asset_id: id });
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
