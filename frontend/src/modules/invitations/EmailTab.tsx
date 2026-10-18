import { useId, useRef } from "react";
import type { FontOption, MediaAsset, Placeholder } from "../../api/types";
import { EmailStyleEditor, type EmailStyle } from "./designer";

interface Props {
  subject: string;
  body: string;
  onSubject: (value: string) => void;
  onBody: (value: string) => void;
  whatsappBody: string;
  onWhatsappBody: (value: string) => void;
  emailStyle: EmailStyle;
  onEmailStyle: (value: EmailStyle) => void;
  placeholders: Placeholder[];
  fonts: FontOption[];
  assets: MediaAsset[];
  onUploadImage: (file: File) => Promise<MediaAsset>;
  assetUrl: (id: string) => string;
  readOnly: boolean;
}

type FieldName = "subject" | "body" | "whatsapp";

export function EmailTab({
  subject,
  body,
  onSubject,
  onBody,
  whatsappBody,
  onWhatsappBody,
  emailStyle,
  onEmailStyle,
  placeholders,
  fonts,
  assets,
  onUploadImage,
  assetUrl,
  readOnly,
}: Props) {
  const subjectId = useId();
  const bodyId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const whatsappId = useId();
  const whatsappRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<FieldName>("body");
  const hasRsvpLink = /\{\{\s*rsvp_link\s*\}\}/i.test(body);

  /** Insert a {{placeholder}} at the cursor of the field last edited (the body by default). */
  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : field === "whatsapp" ? whatsappRef.current : bodyRef.current;
    const value = field === "subject" ? subject : field === "whatsapp" ? whatsappBody : body;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    if (field === "subject") onSubject(next);
    else if (field === "whatsapp") onWhatsappBody(next);
    else onBody(next);
    const caret = start + token.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="email-tab">
      <section className="card card-pad stack">
        <div className="field">
          <label className="field-label" htmlFor={subjectId}>
            Subject
          </label>
          <input
            ref={subjectRef}
            id={subjectId}
            className="input"
            value={subject}
            maxLength={255}
            readOnly={readOnly}
            aria-invalid={subject.trim() ? undefined : true}
            onFocus={() => (lastField.current = "subject")}
            onChange={(e) => onSubject(e.target.value)}
          />
          {!subject.trim() && <span className="field-error">The subject can't be empty.</span>}
        </div>

        <div className="field">
          <label className="field-label" htmlFor={bodyId}>
            Message
          </label>
          <textarea
            ref={bodyRef}
            id={bodyId}
            className="textarea email-body"
            value={body}
            rows={16}
            readOnly={readOnly}
            aria-invalid={body.trim() ? undefined : true}
            aria-describedby={`${bodyId}-hint`}
            onFocus={() => (lastField.current = "body")}
            onChange={(e) => onBody(e.target.value)}
          />
          <span className="field-hint" id={`${bodyId}-hint`}>
            Leave a blank line between paragraphs. <span className="kbd">{"{{rsvp_link}}"}</span> becomes a button
            that opens the guest's invitation{hasRsvpLink ? "." : "; we add it at the end if you leave it out."}
          </span>
          {!body.trim() && <span className="field-error">The message can't be empty.</span>}
        </div>

        {!readOnly && placeholders.length > 0 && (
          <div className="placeholder-chips">
            <span className="field-label">Insert</span>
            <div className="chips" role="group" aria-label="Insert a placeholder">
              {placeholders.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className="chip"
                  title={p.description}
                  aria-label={`Insert ${p.name}: ${p.description}`}
                  // Keep the cursor position in the field.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insert(p.name)}
                >
                  {`{{${p.name}}}`}
                </button>
              ))}
            </div>
            <span className="field-hint">Placeholders are filled in for each guest when the email is sent.</span>
          </div>
        )}
      </section>

      <section className="card card-pad stack-sm">
        <h3>WhatsApp message</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Sent instead of the email to guests with a mobile, when you choose WhatsApp on the Send tab. Plain text with
          the same placeholders; keep it short, the invitation itself is behind the link.
        </p>
        <div className="field">
          <label className="field-label" htmlFor={whatsappId}>
            WhatsApp message
          </label>
          <textarea
            ref={whatsappRef}
            id={whatsappId}
            className="textarea"
            rows={6}
            value={whatsappBody}
            readOnly={readOnly}
            aria-describedby={`${whatsappId}-hint`}
            onFocus={() => (lastField.current = "whatsapp")}
            onChange={(e) => onWhatsappBody(e.target.value)}
          />
          <span className="field-hint" id={`${whatsappId}-hint`}>
            <span className="kbd">{"{{rsvp_link}}"}</span> becomes the tappable link to the guest's invitation; it is
            added at the end if you leave it out. Clear the box to go back to the default wording.
          </span>
        </div>
      </section>

      <section className="card card-pad stack-sm">
        <h3>Email style</h3>
        <p className="small muted" style={{ margin: 0 }}>
          Colours, font, header image and the button guests press to open their invitation.
        </p>
        <EmailStyleEditor
          value={emailStyle}
          onChange={onEmailStyle}
          fonts={fonts}
          assets={assets}
          onUploadImage={onUploadImage}
          assetUrl={assetUrl}
          readOnly={readOnly}
        />
      </section>
    </div>
  );
}
