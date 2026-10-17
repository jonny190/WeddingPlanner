import { useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { Venue, VenueContactInput, VenueInput, VenueStatus } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { SelectField, TextAreaField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { orNull } from "../../lib/format";
import { useCreateVenue, useUpdateVenue } from "../weddings/api";
import { VENUE_STATUS } from "./VenuesPage";

const CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "NZD", "CHF"];
const MAX_CONTACTS = 10;

interface ContactRow {
  key: number;
  name: string;
  role: string;
  email: string;
  phone: string;
}

interface VenueFormState {
  name: string;
  status: VenueStatus;
  address: string;
  website: string;
  email: string;
  phone: string;
  capacity: string;
  price: string;
  price_per_head: string;
  deposit: string;
  currency: string;
  price_notes: string;
  notes: string;
  contacts: ContactRow[];
}

let nextKey = 1;

function initialState(venue: Venue | null): VenueFormState {
  return {
    name: venue?.name ?? "",
    status: venue?.status ?? "considering",
    address: venue?.address ?? "",
    website: venue?.website ?? "",
    email: venue?.email ?? "",
    phone: venue?.phone ?? "",
    capacity: venue?.capacity?.toString() ?? "",
    price: venue?.price?.toString() ?? "",
    price_per_head: venue?.price_per_head?.toString() ?? "",
    deposit: venue?.deposit?.toString() ?? "",
    currency: venue?.currency ?? "GBP",
    price_notes: venue?.price_notes ?? "",
    notes: venue?.notes ?? "",
    contacts: (venue?.contacts ?? []).map((c) => ({
      key: nextKey++,
      name: c.name,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
    })),
  };
}

function money(value: string): number | null {
  const trimmed = value.replace(/[,\s]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function VenueFormModal({
  weddingId,
  venue,
  onClose,
}: {
  weddingId: string;
  /** null to add a new venue. */
  venue: Venue | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<VenueFormState>(() => initialState(venue));
  const create = useCreateVenue(weddingId);
  const update = useUpdateVenue(weddingId);
  const mutation = venue ? update : create;
  const toast = useToast();
  const fieldErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};
  const set = <K extends keyof VenueFormState>(key: K, value: VenueFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setContact = (key: number, field: keyof Omit<ContactRow, "key">, value: string) =>
    setForm((f) => ({ ...f, contacts: f.contacts.map((c) => (c.key === key ? { ...c, [field]: value } : c)) }));

  const submit = () => {
    const contacts: VenueContactInput[] = form.contacts
      .filter((c) => c.name.trim())
      .map((c) => ({ name: c.name.trim(), role: orNull(c.role), email: orNull(c.email), phone: orNull(c.phone) }));
    const capacity = form.capacity.trim() ? Number(form.capacity) : null;
    const data: VenueInput = {
      name: form.name.trim(),
      status: form.status,
      address: orNull(form.address),
      website: orNull(form.website),
      email: orNull(form.email),
      phone: orNull(form.phone),
      capacity: Number.isInteger(capacity) ? capacity : null,
      price: money(form.price),
      price_per_head: money(form.price_per_head),
      deposit: money(form.deposit),
      currency: form.currency,
      price_notes: orNull(form.price_notes),
      notes: orNull(form.notes),
      contacts,
    };
    const onSuccess = () => {
      toast.success(venue ? "Venue updated." : `${data.name} added.`);
      onClose();
    };
    if (venue) update.mutate({ id: venue.id, data }, { onSuccess });
    else create.mutate(data, { onSuccess });
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={venue ? `Edit ${venue.name}` : "Add a venue"}
      description="Prices and notes are for you. The name and address reach guests once the venue is chosen for an event."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {venue ? "Save venue" : "Add venue"}
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
          label="Venue name"
          required
          maxLength={200}
          autoFocus
          placeholder="e.g. Hartwell Manor"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          error={fieldErrors.name}
        />
        <SelectField label="Status" value={form.status} onChange={(e) => set("status", e.target.value as VenueStatus)}>
          {(Object.keys(VENUE_STATUS) as VenueStatus[]).map((s) => (
            <option key={s} value={s}>
              {VENUE_STATUS[s].label}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          className="span-2"
          label="Address"
          optional
          rows={2}
          hint="Goes on invitations and into guests' calendar entries."
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          error={fieldErrors.address}
        />
        <TextField
          label="Website"
          optional
          maxLength={500}
          placeholder="hartwellmanor.co.uk"
          value={form.website}
          onChange={(e) => set("website", e.target.value)}
          error={fieldErrors.website}
        />
        <TextField
          label="Capacity"
          type="number"
          optional
          min={0}
          hint="Guests it can take."
          value={form.capacity}
          onChange={(e) => set("capacity", e.target.value)}
          error={fieldErrors.capacity}
        />
        <TextField
          label="Email"
          type="email"
          optional
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

        <h3 className="span-2 section-subtitle">Prices</h3>
        <SelectField label="Currency" value={form.currency} onChange={(e) => set("currency", e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Hire price"
          optional
          inputMode="decimal"
          placeholder="e.g. 5000"
          value={form.price}
          onChange={(e) => set("price", e.target.value)}
          error={fieldErrors.price}
        />
        <TextField
          label="Per head"
          optional
          inputMode="decimal"
          placeholder="e.g. 85"
          value={form.price_per_head}
          onChange={(e) => set("price_per_head", e.target.value)}
          error={fieldErrors.price_per_head}
        />
        <TextField
          label="Deposit"
          optional
          inputMode="decimal"
          value={form.deposit}
          onChange={(e) => set("deposit", e.target.value)}
          error={fieldErrors.deposit}
        />
        <TextAreaField
          className="span-2"
          label="Price notes"
          optional
          rows={2}
          placeholder="What is included, payment dates, minimum numbers…"
          value={form.price_notes}
          onChange={(e) => set("price_notes", e.target.value)}
        />

        <h3 className="span-2 section-subtitle">Contacts</h3>
        {form.contacts.length === 0 && <p className="span-2 small muted">Nobody added yet.</p>}
        {form.contacts.map((c, index) => (
          <div key={c.key} className="span-2 venue-contact-row" role="group" aria-label={`Contact ${index + 1}`}>
            <TextField
              label={`Contact ${index + 1} name`}
              maxLength={120}
              value={c.name}
              onChange={(e) => setContact(c.key, "name", e.target.value)}
            />
            <TextField label="Role" optional maxLength={120} placeholder="e.g. Events coordinator" value={c.role} onChange={(e) => setContact(c.key, "role", e.target.value)} />
            <TextField label="Email" type="email" optional value={c.email} onChange={(e) => setContact(c.key, "email", e.target.value)} />
            <TextField label="Phone" type="tel" optional maxLength={50} value={c.phone} onChange={(e) => setContact(c.key, "phone", e.target.value)} />
            <IconButton
              icon="trash"
              tone="danger"
              label={`Remove contact ${index + 1}`}
              onClick={() => setForm((f) => ({ ...f, contacts: f.contacts.filter((x) => x.key !== c.key) }))}
            />
          </div>
        ))}
        {form.contacts.length < MAX_CONTACTS && (
          <div className="span-2">
            <Button
              size="sm"
              icon="plus"
              onClick={() =>
                setForm((f) => ({ ...f, contacts: [...f.contacts, { key: nextKey++, name: "", role: "", email: "", phone: "" }] }))
              }
            >
              Add a contact
            </Button>
          </div>
        )}

        <TextAreaField
          className="span-2"
          label="Notes"
          optional
          rows={3}
          placeholder="Viewing impressions, questions to ask, what you liked…"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </Modal>
  );
}
