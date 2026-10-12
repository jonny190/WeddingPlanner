import { useMemo, useState } from "react";
import { errorMessage } from "../../api/client";
import type { Audience, Guest, Recipient, SendResult, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { RadioCard, SelectField, TextField } from "../../components/fields";
import { GuestMultiSelect, type PickerOption } from "../../components/GuestPicker";
import { Callout } from "../../components/misc";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { useSendDraft, useSendTest } from "./api";
import { DeliveryLog } from "./DeliveryLog";

export const AUDIENCES: { id: Audience; title: string; description: string }[] = [
  {
    id: "unsent",
    title: "Guests who haven't been sent it yet",
    description: "Everyone invited to this event who hasn't had an invitation. Safe to use again after adding guests.",
  },
  {
    id: "pending",
    title: "Everyone who hasn't replied",
    description: "A reminder for all invited guests still awaiting a reply, whether or not they opened it.",
  },
  {
    id: "opened_no_reply",
    title: "Opened the invitation but hasn't replied",
    description: "Guests who clicked through to their invitation but haven't answered. A gentle nudge works well.",
  },
  {
    id: "not_opened",
    title: "Sent, but never opened",
    description: "Guests who were sent the invitation but haven't opened the link. Their email may have gone to spam.",
  },
  {
    id: "all",
    title: "Everyone invited to this event",
    description: "Every invited guest, including those who have already replied.",
  },
  {
    id: "selected",
    title: "Only the guests I choose",
    description: "Pick individual guests below.",
  },
];

export function isAudience(value: string | null): value is Audience {
  return AUDIENCES.some((a) => a.id === value);
}

interface Props {
  weddingId: string;
  event: WeddingEvent;
  draftId: string;
  /** Guests invited to this event. */
  guests: Guest[];
  initialAudience: Audience;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  canEdit: boolean;
}

export function SendTab({ weddingId, event, draftId, guests, initialAudience, dirty, saving, onSave, canEdit }: Props) {
  const { user } = useSession();
  const [audience, setAudience] = useState<Audience>(initialAudience);
  const [selected, setSelected] = useState<string[]>([]);
  const [dryRun, setDryRun] = useState<SendResult | null>(null);
  const [lastSent, setLastSent] = useState<SendResult | null>(null);
  const send = useSendDraft(weddingId, event.id, draftId);
  const confirm = useConfirm();
  const toast = useToast();

  const options: PickerOption[] = useMemo(
    () => guests.map((g) => ({ id: g.id, name: g.full_name, detail: g.email ?? "no email" })),
    [guests],
  );

  const request = () => ({ audience, guest_ids: audience === "selected" ? selected : [] });
  const canCheck = audience !== "selected" || selected.length > 0;

  const resetChecks = () => {
    setDryRun(null);
    setLastSent(null);
  };

  const check = async () => {
    try {
      setLastSent(null);
      setDryRun(await send.mutateAsync({ ...request(), dry_run: true }));
    } catch (err) {
      toast.error(err);
    }
  };

  const sendForReal = async () => {
    if (!dryRun || dryRun.queued.length === 0) return;
    const ok = await confirm({
      title: `Send to ${pluralize(dryRun.queued.length, "guest")}?`,
      message: `Each guest receives a personal email with a link to their invitation for ${event.name}. This can't be undone.`,
      confirmLabel: `Send ${pluralize(dryRun.queued.length, "email")}`,
      tone: "primary",
    });
    if (!ok) return;
    try {
      const result = await send.mutateAsync({ ...request(), dry_run: false });
      setDryRun(null);
      setLastSent(result);
      toast.success(`${pluralize(result.queued.length, "email")} queued for sending.`);
    } catch (err) {
      toast.error(err);
    }
  };

  if (!canEdit) {
    return (
      <div className="stack">
        <Callout tone="info">Only editors can send invitations. Here's what has been sent so far.</Callout>
        <DeliveryLog weddingId={weddingId} eventId={event.id} />
      </div>
    );
  }

  return (
    <div className="send-tab">
      <div className="stack">
        {dirty && (
          <Callout tone="warning">
            <div className="row-between">
              <span>You have unsaved changes. Guests receive the saved version, so save before sending.</span>
              <Button size="sm" variant="primary" onClick={onSave} loading={saving}>
                Save now
              </Button>
            </div>
          </Callout>
        )}

        <section className="card card-pad stack">
          <fieldset className="radio-group">
            <legend className="section-title" style={{ marginBottom: 10 }}>
              Who should receive it?
            </legend>
            {AUDIENCES.map((a) => (
              <RadioCard
                key={a.id}
                name="audience"
                value={a.id}
                checked={audience === a.id}
                onChange={(v) => {
                  setAudience(v as Audience);
                  resetChecks();
                }}
                title={a.title}
                description={a.description}
              />
            ))}
          </fieldset>

          {audience === "selected" && (
            <GuestMultiSelect
              label={`Guests invited to ${event.name}`}
              options={options}
              value={selected}
              onChange={(ids) => {
                setSelected(ids);
                resetChecks();
              }}
            />
          )}

          <div className="row">
            <Button icon="eye" onClick={() => void check()} loading={send.isPending && !dryRun} disabled={!canCheck}>
              Check who will receive it
            </Button>
            <span className="small muted">Nothing is sent until you confirm.</span>
          </div>

          {dryRun && (
            <div className="dry-run" aria-live="polite">
              {dryRun.queued.length === 0 ? (
                <Callout tone="info">Nobody matches this audience with an email address right now.</Callout>
              ) : (
                <RecipientList
                  title={`${pluralize(dryRun.queued.length, "guest")} will receive it`}
                  recipients={dryRun.queued}
                  showEmail
                />
              )}
              {dryRun.skipped_no_email.length > 0 && (
                <Callout tone="warning">
                  <RecipientList
                    title={`${pluralize(dryRun.skipped_no_email.length, "guest")} skipped: no email address`}
                    recipients={dryRun.skipped_no_email}
                  />
                  <span className="small">
                    Add their email on the Guests page, or post their invitation and mark it as sent on the Replies
                    page.
                  </span>
                </Callout>
              )}
              {dryRun.queued.length > 0 && (
                <div className="row">
                  <Button
                    variant="primary"
                    icon="send"
                    onClick={() => void sendForReal()}
                    loading={send.isPending}
                    disabled={dirty}
                    title={dirty ? "Save your changes first" : undefined}
                  >
                    Send to {pluralize(dryRun.queued.length, "guest")}
                  </Button>
                  <Button variant="ghost" onClick={() => setDryRun(null)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}

          {lastSent && (
            <Callout tone="success">
              <strong>{pluralize(lastSent.queued.length, "email")} queued.</strong> They'll go out in the next few
              moments; follow progress in the delivery log below.
              {lastSent.skipped_no_email.length > 0 &&
                ` ${pluralize(lastSent.skipped_no_email.length, "guest")} without an email address were skipped.`}
            </Callout>
          )}
        </section>

        <TestSend
          weddingId={weddingId}
          eventId={event.id}
          draftId={draftId}
          guests={guests}
          defaultEmail={user?.email ?? ""}
          dirty={dirty}
        />

        <DeliveryLog weddingId={weddingId} eventId={event.id} limit={10} />
      </div>
    </div>
  );
}

function RecipientList({ title, recipients, showEmail }: { title: string; recipients: Recipient[]; showEmail?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? recipients : recipients.slice(0, 8);
  return (
    <div className="recipient-list">
      <strong>{title}</strong>
      <ul className="list-plain">
        {shown.map((r) => (
          <li key={r.guest_id}>
            {r.full_name}
            {showEmail && r.email && <span className="muted small"> · {r.email}</span>}
          </li>
        ))}
      </ul>
      {recipients.length > 8 && (
        <button type="button" className="link-btn small" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${recipients.length}`}
        </button>
      )}
    </div>
  );
}

function TestSend({
  weddingId,
  eventId,
  draftId,
  guests,
  defaultEmail,
  dirty,
}: {
  weddingId: string;
  eventId: string;
  draftId: string;
  guests: Guest[];
  defaultEmail: string;
  dirty: boolean;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [asGuest, setAsGuest] = useState("");
  const sendTest = useSendTest(weddingId, eventId, draftId);
  const toast = useToast();

  return (
    <section className="card card-pad">
      <form
        className="stack-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await sendTest.mutateAsync({ email: email.trim(), guest_id: asGuest || null });
            toast.success(`Test email queued to ${email.trim()}.`);
          } catch {
            // Shown inline below the form.
          }
        }}
      >
        <h3 className="section-title">Send a test to yourself</h3>
        <p className="small muted" style={{ margin: 0 }}>
          See exactly what guests will get in their inbox. Test emails don't count as sent invitations.
          {dirty && " It uses the last saved version."}
        </p>
        <div className="test-send-row">
          <TextField
            label="Send to"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <SelectField label="Personalise as" value={asGuest} onChange={(e) => setAsGuest(e.target.value)}>
            <option value="">Example guest</option>
            {guests.map((g) => (
              <option key={g.id} value={g.id}>
                {g.full_name}
              </option>
            ))}
          </SelectField>
          <Button type="submit" icon="send" loading={sendTest.isPending} className="test-send-btn">
            Send test
          </Button>
        </div>
        {sendTest.isError && <p className="inline-error">{errorMessage(sendTest.error)}</p>}
      </form>
    </section>
  );
}
