import { useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { EventInput, EventKind, WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { SelectField, TextAreaField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { fromDateTimeInput, orNull, toDateTimeInput } from "../../lib/format";
import { useCreateEvent, useUpdateEvent } from "./api";

interface EventFormState {
  name: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  venue_name: string;
  venue_address: string;
  details: string;
  rsvp_deadline: string;
}

function initialState(event: WeddingEvent | null): EventFormState {
  return {
    name: event?.name ?? "",
    kind: event?.kind ?? "other",
    starts_at: toDateTimeInput(event?.starts_at),
    ends_at: toDateTimeInput(event?.ends_at),
    venue_name: event?.venue_name ?? "",
    venue_address: event?.venue_address ?? "",
    details: event?.details ?? "",
    rsvp_deadline: event?.rsvp_deadline ?? "",
  };
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  day: "Wedding day (ceremony & meal)",
  evening: "Evening reception",
  other: "Other",
};

interface Props {
  weddingId: string;
  /** null to create a new event. */
  event: WeddingEvent | null;
  onClose: () => void;
}

export function EventFormModal({ weddingId, event, onClose }: Props) {
  const [form, setForm] = useState<EventFormState>(() => initialState(event));
  const create = useCreateEvent(weddingId);
  const update = useUpdateEvent(weddingId);
  const mutation = event ? update : create;
  const toast = useToast();
  const fieldErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};
  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const endsBeforeStart = Boolean(form.starts_at && form.ends_at && form.ends_at < form.starts_at);

  const submit = () => {
    if (endsBeforeStart) return;
    const data: EventInput = {
      name: form.name.trim(),
      kind: form.kind,
      // Naive wall-clock times at the venue, without a time zone.
      starts_at: fromDateTimeInput(form.starts_at),
      ends_at: fromDateTimeInput(form.ends_at),
      venue_name: orNull(form.venue_name),
      venue_address: orNull(form.venue_address),
      details: orNull(form.details),
      rsvp_deadline: form.rsvp_deadline || null,
    };
    const onSuccess = () => {
      toast.success(event ? "Event updated." : `${data.name} added.`);
      onClose();
    };
    if (event) update.mutate({ id: event.id, data }, { onSuccess });
    else create.mutate(data, { onSuccess });
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={event ? `Edit ${event.name}` : "Add an event"}
      description="Times are local to the venue. They appear on invitations and the RSVP page."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {event ? "Save event" : "Add event"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {mutation.isError && (
          <div className="span-2">
            <Callout tone="danger">{errorMessage(mutation.error)}</Callout>
          </div>
        )}
        <TextField
          label="Name"
          required
          maxLength={120}
          autoFocus
          placeholder="e.g. Sunday Brunch"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          error={fieldErrors.name}
        />
        <SelectField
          label="Kind"
          value={form.kind}
          onChange={(e) => set("kind", e.target.value as EventKind)}
          hint="Used for CSV import columns and default invitation wording."
        >
          {(Object.keys(EVENT_KIND_LABELS) as EventKind[]).map((k) => (
            <option key={k} value={k}>
              {EVENT_KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Starts"
          type="datetime-local"
          optional
          value={form.starts_at}
          onChange={(e) => set("starts_at", e.target.value)}
          error={fieldErrors.starts_at}
        />
        <TextField
          label="Ends"
          type="datetime-local"
          optional
          value={form.ends_at}
          min={form.starts_at || undefined}
          onChange={(e) => set("ends_at", e.target.value)}
          error={endsBeforeStart ? "The end must be after the start." : fieldErrors.ends_at}
        />
        <TextField
          label="Venue name"
          optional
          maxLength={200}
          value={form.venue_name}
          onChange={(e) => set("venue_name", e.target.value)}
          error={fieldErrors.venue_name}
        />
        <TextField
          label="Reply by"
          type="date"
          optional
          hint="Shown to guests as the RSVP deadline."
          value={form.rsvp_deadline}
          onChange={(e) => set("rsvp_deadline", e.target.value)}
          error={fieldErrors.rsvp_deadline}
        />
        <TextAreaField
          className="span-2"
          label="Venue address"
          optional
          rows={2}
          value={form.venue_address}
          onChange={(e) => set("venue_address", e.target.value)}
        />
        <TextAreaField
          className="span-2"
          label="Details for guests"
          optional
          rows={3}
          placeholder="Dress code, parking, timings…"
          value={form.details}
          onChange={(e) => set("details", e.target.value)}
        />
      </div>
    </Modal>
  );
}
