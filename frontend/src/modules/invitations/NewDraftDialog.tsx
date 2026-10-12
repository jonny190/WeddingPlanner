import { useState } from "react";
import { errorMessage } from "../../api/client";
import type { Draft, WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { RadioCard, SelectField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useAllDrafts, useCreateDraft } from "./api";

interface Props {
  weddingId: string;
  event: WeddingEvent;
  events: WeddingEvent[];
  onClose: () => void;
  onCreated: (draft: Draft) => void;
}

export function NewDraftDialog({ weddingId, event, events, onClose, onCreated }: Props) {
  const all = useAllDrafts(weddingId, events);
  const create = useCreateDraft(weddingId, event.id);
  const [name, setName] = useState("Invitation");
  const [source, setSource] = useState<"template" | "copy">("template");
  const [copyFrom, setCopyFrom] = useState("");
  const hasDrafts = all.drafts.length > 0;
  const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? "Event";

  const submit = () => {
    if (source === "copy" && !copyFrom) return;
    create.mutate(
      {
        name: name.trim() || "Invitation",
        copy_from_draft_id: source === "copy" ? copyFrom : null,
      },
      { onSuccess: onCreated },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!create.isPending}
      title={`New draft for ${event.name}`}
      description="Each draft has its own card design and email. You can keep several, e.g. an invitation and a reminder."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending} disabled={source === "copy" && !copyFrom}>
            Create draft
          </Button>
        </>
      }
    >
      <div className="stack">
        {create.isError && <Callout tone="danger">{errorMessage(create.error)}</Callout>}
        <TextField
          label="Draft name"
          required
          maxLength={120}
          autoFocus
          hint="Only you see this, e.g. “Invitation” or “Reminder”."
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <fieldset className="radio-group">
          <legend className="field-label">Start from</legend>
          <RadioCard
            name="source"
            value="template"
            checked={source === "template"}
            onChange={() => setSource("template")}
            title="Our template"
            description={`A ready-made card and email written for ${event.name}.`}
          />
          <RadioCard
            name="source"
            value="copy"
            checked={source === "copy"}
            onChange={() => setSource("copy")}
            disabled={!hasDrafts}
            title="A copy of an existing draft"
            description={
              hasDrafts
                ? "Reuse a design you've already made, from any event."
                : all.isPending
                  ? "Loading your drafts…"
                  : "You haven't made any drafts yet."
            }
          />
        </fieldset>
        {source === "copy" && (
          <SelectField label="Copy from" required value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Choose a draft…</option>
            {events.map((e) => {
              const drafts = all.drafts.filter((d) => d.event_id === e.id);
              if (drafts.length === 0) return null;
              return (
                <optgroup key={e.id} label={eventName(e.id)}>
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.sent_count > 0 ? ` (sent to ${d.sent_count})` : ""}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </SelectField>
        )}
      </div>
    </Modal>
  );
}
