import { useEffect, useMemo, useState } from "react";
import { errorMessage } from "../../api/client";
import type { Guest, InvitationDesign } from "../../api/types";
import { ErrorState } from "../../components/EmptyState";
import { GuestPicker, type PickerOption } from "../../components/GuestPicker";
import { Icon } from "../../components/Icon";
import { Callout } from "../../components/misc";
import { PageLoader, Spinner } from "../../components/Spinner";
import { usePreview } from "./api";
import { CardRenderer } from "./designer";
import { assetUrl } from "./designerSupport";

interface Props {
  weddingId: string;
  eventId: string;
  draftId: string;
  subject: string;
  body: string;
  design: InvitationDesign;
  /** Guests invited to this event. */
  guests: Guest[];
  guestId: string | null;
  onGuestId: (id: string | null) => void;
}

/** Debounce a value so the preview isn't re-rendered on every keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function PreviewTab({ weddingId, eventId, draftId, subject, body, design, guests, guestId, onGuestId }: Props) {
  const input = useMemo(
    () => ({ guest_id: guestId, subject: subject.trim() ? subject : null, body: body.trim() ? body : null, design }),
    [guestId, subject, body, design],
  );
  const debounced = useDebounced(input, 350);
  const preview = usePreview(weddingId, eventId, draftId, debounced, true);
  const options: PickerOption[] = useMemo(
    () => guests.map((g) => ({ id: g.id, name: g.full_name, detail: g.email ?? "no email" })),
    [guests],
  );

  return (
    <div className="stack">
      <div className="preview-toolbar">
        <div className="preview-as">
          <GuestPicker
            label="Preview as"
            placeholder="Example guest (Alex Example)"
            options={options}
            value={guestId}
            onChange={onGuestId}
            hint={guestId ? "Clear to go back to the example guest." : "Pick a guest to see their personalised invitation."}
          />
        </div>
        {preview.isFetching && (
          <span className="small muted row" style={{ gap: 6 }}>
            <Spinner /> Updating preview…
          </span>
        )}
      </div>

      {preview.isPending ? (
        <PageLoader label="Rendering preview…" />
      ) : preview.isError && !preview.data ? (
        <ErrorState error={preview.error} onRetry={() => void preview.refetch()} title="We couldn't render the preview" />
      ) : preview.data ? (
        <>
          {preview.isError && (
            <Callout tone="danger">The latest changes couldn't be previewed: {errorMessage(preview.error)}</Callout>
          )}
          {preview.data.unknown_placeholders.length > 0 && (
            <Callout tone="warning">
              <strong>Unknown placeholders:</strong>{" "}
              {preview.data.unknown_placeholders.map((p) => `{{${p}}}`).join(", ")}. They'll appear exactly as typed.
              Check the spelling, or use one of the chips on the Email tab.
            </Callout>
          )}
          <div className="preview-grid">
            <section className="preview-pane">
              <h3 className="preview-label">
                <Icon name="heart" size={15} /> Invitation card
                <span className="tiny muted"> · as {preview.data.guest_name} sees it on their RSVP page</span>
              </h3>
              <div className="preview-card-frame">
                <CardRenderer design={preview.data.card} fonts={preview.data.fonts} assetUrl={assetUrl} />
              </div>
            </section>
            <section className="preview-pane">
              <h3 className="preview-label">
                <Icon name="mail" size={15} /> Email
              </h3>
              <div className="email-frame">
                <div className="email-frame-head">
                  <div>
                    <span className="muted">To:</span> {preview.data.guest_name}
                  </div>
                  <div>
                    <span className="muted">Subject:</span> <strong>{preview.data.subject}</strong>
                  </div>
                </div>
                <iframe
                  title={`Email preview for ${preview.data.guest_name}`}
                  className="email-iframe"
                  sandbox=""
                  srcDoc={preview.data.html}
                />
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
