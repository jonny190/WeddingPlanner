import { useId, useRef, useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { AgeGroup, Guest, GuestInput, InvitationSpec, WeddingEvent } from "../../api/types";
import { RsvpBadge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Checkbox, SelectField, TextAreaField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { orNull } from "../../lib/format";
import { useCreateGuest, useUpdateGuest } from "./api";

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: "Adult",
  child: "Child",
  infant: "Infant",
};

interface Props {
  weddingId: string;
  events: WeddingEvent[];
  /** null to add a new guest. */
  guest: Guest | null;
  groups: string[];
  onClose: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  group_name: string;
  age_group: AgeGroup;
  dietary_requirements: string;
  notes: string;
  invitations: Record<string, { invited: boolean; plusOne: boolean }>;
}

function initial(guest: Guest | null, events: WeddingEvent[]): FormState {
  const invitations: FormState["invitations"] = {};
  for (const e of events) {
    const inv = guest?.invitations.find((i) => i.event_id === e.id);
    // New guests are invited to every event by default; untick as needed.
    invitations[e.id] = { invited: guest ? Boolean(inv) : true, plusOne: inv?.plus_one_allowed ?? false };
  }
  return {
    first_name: guest?.first_name ?? "",
    last_name: guest?.last_name ?? "",
    email: guest?.email ?? "",
    phone: guest?.phone ?? "",
    group_name: guest?.group_name ?? "",
    age_group: guest?.age_group ?? "adult",
    dietary_requirements: guest?.dietary_requirements ?? "",
    notes: guest?.notes ?? "",
    invitations,
  };
}

export function GuestFormModal({ weddingId, events, guest, groups, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => initial(guest, events));
  const [addAnother, setAddAnother] = useState(false);
  const create = useCreateGuest(weddingId);
  const update = useUpdateGuest(weddingId);
  const mutation = guest ? update : create;
  const toast = useToast();
  const groupListId = useId();
  const firstNameRef = useRef<HTMLInputElement>(null);
  const fieldErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setInvite = (eventId: string, patch: Partial<{ invited: boolean; plusOne: boolean }>) =>
    setForm((f) => {
      const current = f.invitations[eventId];
      const next = { ...current, ...patch };
      if (!next.invited) next.plusOne = false;
      return { ...f, invitations: { ...f.invitations, [eventId]: next } };
    });

  // Unticking an event that already has a reply deletes that reply.
  const losingReplies = guest
    ? events.filter((e) => {
        const inv = guest.invitations.find((i) => i.event_id === e.id);
        return inv && inv.rsvp_status !== "pending" && !form.invitations[e.id]?.invited;
      })
    : [];

  const submit = () => {
    const invitations: InvitationSpec[] = events
      .filter((e) => form.invitations[e.id]?.invited)
      .map((e) => ({ event_id: e.id, plus_one_allowed: form.invitations[e.id].plusOne }));
    const data: GuestInput = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: orNull(form.email),
      phone: orNull(form.phone),
      group_name: orNull(form.group_name),
      age_group: form.age_group,
      dietary_requirements: orNull(form.dietary_requirements),
      notes: orNull(form.notes),
      invitations,
    };
    if (guest) {
      update.mutate(
        { id: guest.id, data },
        {
          onSuccess: (g) => {
            toast.success(`${g.full_name} updated.`);
            onClose();
          },
        },
      );
    } else {
      create.mutate(data, {
        onSuccess: (g) => {
          toast.success(`${g.full_name} added.`);
          if (addAnother) {
            // Keep the group and invitations: guests are often added family by family.
            setForm((f) => ({ ...initial(null, events), group_name: f.group_name, invitations: f.invitations }));
            create.reset();
            firstNameRef.current?.focus();
          } else {
            onClose();
          }
        },
      });
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={guest ? `Edit ${guest.full_name}` : "Add a guest"}
      onSubmit={submit}
      footer={
        <>
          {!guest && (
            <label className="checkbox" style={{ marginRight: "auto", alignSelf: "center" }}>
              <input type="checkbox" checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
              <span>Add another after this</span>
            </label>
          )}
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {guest ? "Save guest" : "Add guest"}
          </Button>
        </>
      }
    >
      <div className="stack">
        {mutation.isError && <Callout tone="danger">{errorMessage(mutation.error)}</Callout>}
        <div className="form-grid">
          <TextField
            ref={firstNameRef}
            label="First name"
            required
            maxLength={100}
            autoFocus
            value={form.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            error={fieldErrors.first_name}
          />
          <TextField
            label="Last name"
            optional
            maxLength={100}
            value={form.last_name}
            onChange={(e) => set("last_name", e.target.value)}
            error={fieldErrors.last_name}
          />
          <TextField
            label="Email"
            type="email"
            optional
            hint={form.email ? undefined : "Needed to email the invitation."}
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            error={fieldErrors.email}
          />
          <TextField
            label="Phone"
            type="tel"
            optional
            maxLength={50}
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            error={fieldErrors.phone}
          />
          <TextField
            label="Group"
            optional
            maxLength={100}
            list={groupListId}
            placeholder="e.g. Bride's family, University friends"
            hint="Groups help with filtering and keep families together when seating."
            value={form.group_name}
            onChange={(e) => set("group_name", e.target.value)}
            error={fieldErrors.group_name}
          />
          <datalist id={groupListId}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <SelectField
            label="Age group"
            value={form.age_group}
            onChange={(e) => set("age_group", e.target.value as AgeGroup)}
          >
            {(Object.keys(AGE_GROUP_LABELS) as AgeGroup[]).map((a) => (
              <option key={a} value={a}>
                {AGE_GROUP_LABELS[a]}
              </option>
            ))}
          </SelectField>
          <TextAreaField
            label="Dietary requirements"
            optional
            rows={2}
            value={form.dietary_requirements}
            onChange={(e) => set("dietary_requirements", e.target.value)}
          />
          <TextAreaField
            label="Notes"
            optional
            rows={2}
            hint="Only visible to you."
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <fieldset className="invite-fieldset">
          <legend className="field-label">Invited to</legend>
          {events.length === 0 && <p className="small muted">Add events in Settings first.</p>}
          {events.map((e) => {
            const state = form.invitations[e.id];
            const inv = guest?.invitations.find((i) => i.event_id === e.id);
            return (
              <div key={e.id} className="invite-option">
                <Checkbox
                  label={<strong>{e.name}</strong>}
                  checked={state?.invited ?? false}
                  onChange={(ev) => setInvite(e.id, { invited: ev.target.checked })}
                />
                <Checkbox
                  label="Can bring a guest (+1)"
                  checked={state?.plusOne ?? false}
                  disabled={!state?.invited}
                  onChange={(ev) => setInvite(e.id, { plusOne: ev.target.checked })}
                />
                {inv && <RsvpBadge status={inv.rsvp_status} />}
              </div>
            );
          })}
        </fieldset>
        {losingReplies.length > 0 && (
          <Callout tone="warning">
            {guest?.first_name} has already replied to {losingReplies.map((e) => e.name).join(" and ")}. Removing the
            invitation deletes that reply.
          </Callout>
        )}
      </div>
    </Modal>
  );
}
