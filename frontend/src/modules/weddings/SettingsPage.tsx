import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../../api/client";
import type { Wedding, WeddingEvent, WeddingUpdate } from "../../api/types";
import { useSession } from "../../auth/session";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { TextAreaField, TextField } from "../../components/fields";
import { Callout, PageHeader } from "../../components/misc";
import { useToast } from "../../components/Toasts";
import { useUnsavedChanges } from "../../layout/NavigationGuard";
import { formatEventWhen, formatLongDate, orNull, parseDate } from "../../lib/format";
import { deepEqual } from "../../lib/utils";
import { useDeleteEvent, useDeleteWedding, useUpdateWedding } from "./api";
import { EventFormModal } from "./EventFormModal";
import { useEvents, useWedding } from "./WeddingContext";

export default function SettingsPage() {
  const wedding = useWedding();
  const { canEdit } = useSession();
  return (
    <div className="stack-lg content-narrow" style={{ marginLeft: 0 }}>
      <PageHeader title="Settings" subtitle="The couple's details, the events guests are invited to, and more." />
      <WeddingDetailsForm key={wedding.id} wedding={wedding} canEdit={canEdit} />
      <EventsSection canEdit={canEdit} />
      {canEdit && <DangerZone wedding={wedding} />}
    </div>
  );
}

function toForm(w: Wedding) {
  return {
    partner_one_name: w.partner_one_name,
    partner_two_name: w.partner_two_name,
    title: w.title,
    wedding_date: w.wedding_date ?? "",
    contact_email: w.contact_email ?? "",
    notes: w.notes ?? "",
  };
}

function WeddingDetailsForm({ wedding, canEdit }: { wedding: Wedding; canEdit: boolean }) {
  const [form, setForm] = useState(() => toForm(wedding));
  const [baseline, setBaseline] = useState(() => toForm(wedding));
  const update = useUpdateWedding(wedding.id);
  const toast = useToast();
  const dirty = !deepEqual(form, baseline);
  useUnsavedChanges(dirty);
  const fieldErrors = update.error instanceof ApiError ? update.error.fieldErrors : {};
  const set = (key: keyof ReturnType<typeof toForm>, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    const data: WeddingUpdate = {
      partner_one_name: form.partner_one_name.trim(),
      partner_two_name: form.partner_two_name.trim(),
      wedding_date: form.wedding_date || null,
      contact_email: orNull(form.contact_email),
      notes: orNull(form.notes),
    };
    // The title cannot be blank; leave it unchanged if cleared.
    if (form.title.trim()) data.title = form.title.trim();
    update.mutate(data, {
      onSuccess: (w) => {
        const next = toForm(w);
        setForm(next);
        setBaseline(next);
        toast.success("Wedding details saved.");
      },
    });
  };

  return (
    <section className="card">
      <header className="card-header">
        <h2 className="section-title">Wedding details</h2>
      </header>
      <form
        className="card-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {update.isError && <Callout tone="danger">{errorMessage(update.error)}</Callout>}
        <fieldset disabled={!canEdit} className="form-grid" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <TextField
            label="Partner one"
            required
            value={form.partner_one_name}
            onChange={(e) => set("partner_one_name", e.target.value)}
            error={fieldErrors.partner_one_name}
          />
          <TextField
            label="Partner two"
            required
            value={form.partner_two_name}
            onChange={(e) => set("partner_two_name", e.target.value)}
            error={fieldErrors.partner_two_name}
          />
          <TextField
            label="Title"
            hint="How this wedding is named in the app and on the RSVP page."
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            error={fieldErrors.title}
          />
          <TextField
            label="Wedding date"
            type="date"
            optional
            value={form.wedding_date}
            onChange={(e) => set("wedding_date", e.target.value)}
            error={fieldErrors.wedding_date}
          />
          <TextField
            label="Contact email"
            type="email"
            optional
            hint="Guests' replies to invitation emails go here."
            value={form.contact_email}
            onChange={(e) => set("contact_email", e.target.value)}
            error={fieldErrors.contact_email}
          />
          <TextAreaField
            className="span-2"
            label="Notes"
            optional
            rows={3}
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </fieldset>
        {canEdit && (
          <div className="form-actions">
            {dirty && (
              <Button variant="ghost" onClick={() => setForm(baseline)} disabled={update.isPending}>
                Discard changes
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={!dirty} loading={update.isPending}>
              Save details
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}

function EventsSection({ canEdit }: { canEdit: boolean }) {
  const wedding = useWedding();
  const events = useEvents();
  const [editing, setEditing] = useState<WeddingEvent | "new" | null>(null);
  const remove = useDeleteEvent(wedding.id);
  const confirm = useConfirm();
  const toast = useToast();

  const onDelete = async (event: WeddingEvent) => {
    const ok = await confirm({
      title: `Delete ${event.name}?`,
      message:
        "Guests' invitations and replies for this event, its seating plan and its invitation drafts will be deleted too. This can't be undone.",
      confirmLabel: "Delete event",
      tone: "danger",
    });
    if (!ok) return;
    remove.mutate(event.id, {
      onSuccess: () => toast.success(`${event.name} deleted.`),
      onError: (err) => toast.error(err),
    });
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Events</h2>
          <div className="small muted">Guests are invited to each event separately.</div>
        </div>
        {canEdit && (
          <Button icon="plus" onClick={() => setEditing("new")}>
            Add event
          </Button>
        )}
      </header>
      <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {events.length === 0 ? (
          <EmptyState compact icon="calendar" title="No events">
            Add the ceremony, the evening reception or any other celebration guests can be invited to.
          </EmptyState>
        ) : (
          events.map((event) => (
            <div className="event-row" key={event.id}>
              <div className="stack-sm" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong>{event.name}</strong>
                  <Badge tone={event.kind === "other" ? "neutral" : "accent"}>{event.kind}</Badge>
                </div>
                <div className="event-meta">
                  <span>{event.starts_at ? formatEventWhen(event.starts_at, event.ends_at) : "Time not set"}</span>
                  {(event.venue_name || event.venue_address) && (
                    <span>{[event.venue_name, event.venue_address].filter(Boolean).join(", ")}</span>
                  )}
                  {event.rsvp_deadline && <span>Reply by {formatLongDate(parseDate(event.rsvp_deadline))}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 2, flexWrap: "nowrap" }}>
                  <IconButton icon="edit" label={`Edit ${event.name}`} onClick={() => setEditing(event)} />
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`Delete ${event.name}`}
                    onClick={() => void onDelete(event)}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {editing && (
        <EventFormModal
          weddingId={wedding.id}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function DangerZone({ wedding }: { wedding: Wedding }) {
  const confirm = useConfirm();
  const remove = useDeleteWedding(wedding.id);
  const navigate = useNavigate();
  const toast = useToast();

  const onDelete = async () => {
    const ok = await confirm({
      title: "Delete this wedding?",
      message: (
        <>
          This permanently deletes <strong>{wedding.couple_names}</strong>'s wedding: every guest, invitation,
          reply, seating plan and uploaded image. Guests' RSVP links will stop working.
        </>
      ),
      typedConfirmation: wedding.couple_names,
      confirmLabel: "Delete wedding",
      tone: "danger",
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success("Wedding deleted.");
        navigate("/", { replace: true });
      },
      onError: (err) => toast.error(err),
    });
  };

  return (
    <section className="card danger-zone">
      <header className="card-header">
        <h2 className="section-title">Delete wedding</h2>
      </header>
      <div className="card-body row-between">
        <p className="muted" style={{ margin: 0, maxWidth: 520 }}>
          Remove this wedding and everything in it. This can't be undone.
        </p>
        <Button variant="danger" icon="trash" onClick={() => void onDelete()} loading={remove.isPending}>
          Delete wedding
        </Button>
      </div>
    </section>
  );
}
