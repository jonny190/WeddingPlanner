import { useState } from "react";
import { errorMessage } from "../../api/client";
import type { ReplyRow, RsvpStatus, WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { Checkbox, RadioCard, TextAreaField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { orNull } from "../../lib/format";
import { useRecordReply } from "./api";

interface Props {
  weddingId: string;
  event: WeddingEvent;
  reply: ReplyRow;
  onClose: () => void;
}

/** Record a reply received by phone, post or in person. */
export function RecordReplyModal({ weddingId, event, reply, onClose }: Props) {
  const [status, setStatus] = useState<RsvpStatus>(reply.rsvp_status === "pending" ? "attending" : reply.rsvp_status);
  const [plusOne, setPlusOne] = useState(Boolean(reply.plus_one_attending));
  const [plusOneName, setPlusOneName] = useState(reply.plus_one_name ?? "");
  const [plusOneDietary, setPlusOneDietary] = useState(reply.plus_one_dietary ?? "");
  const [dietary, setDietary] = useState(reply.dietary_requirements ?? "");
  const [message, setMessage] = useState(reply.guest_message ?? "");
  const record = useRecordReply(weddingId, event.id);
  const toast = useToast();
  const showPlusOne = reply.plus_one_allowed && status === "attending";

  const submit = () => {
    record.mutate(
      {
        guestId: reply.guest_id,
        data: {
          rsvp_status: status,
          plus_one_attending: showPlusOne ? plusOne : null,
          plus_one_name: showPlusOne && plusOne ? orNull(plusOneName) : null,
          plus_one_dietary: showPlusOne && plusOne ? orNull(plusOneDietary) : null,
          dietary_requirements: orNull(dietary),
          guest_message: orNull(message),
        },
      },
      {
        onSuccess: (row) => {
          toast.success(
            row.rsvp_status === "pending"
              ? `${row.full_name}'s reply was cleared.`
              : `Recorded: ${row.full_name} is ${row.rsvp_status === "attending" ? "coming" : "not coming"} to ${event.name}.`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!record.isPending}
      title={`Record ${reply.full_name}'s reply`}
      description={`For replies to ${event.name} that came by phone, post or in person.`}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={record.isPending}>
            Save reply
          </Button>
        </>
      }
    >
      <div className="stack">
        {record.isError && <Callout tone="danger">{errorMessage(record.error)}</Callout>}
        <fieldset className="radio-group">
          <legend className="field-label">Reply</legend>
          <RadioCard
            name="rsvp"
            value="attending"
            checked={status === "attending"}
            onChange={() => setStatus("attending")}
            title="Attending"
          />
          <RadioCard
            name="rsvp"
            value="declined"
            checked={status === "declined"}
            onChange={() => setStatus("declined")}
            title="Can't come"
          />
          {reply.rsvp_status !== "pending" && (
            <RadioCard
              name="rsvp"
              value="pending"
              checked={status === "pending"}
              onChange={() => setStatus("pending")}
              title="No reply yet"
              description="Clears the current reply."
            />
          )}
        </fieldset>
        {showPlusOne && (
          <div className="plus-one-box stack-sm">
            <Checkbox
              label="Bringing a guest"
              checked={plusOne}
              onChange={(e) => setPlusOne(e.target.checked)}
            />
            {plusOne && (
              <div className="form-grid">
                <TextField
                  label="Guest's name"
                  optional
                  maxLength={200}
                  value={plusOneName}
                  onChange={(e) => setPlusOneName(e.target.value)}
                />
                <TextField
                  label="Their dietary requirements"
                  optional
                  value={plusOneDietary}
                  onChange={(e) => setPlusOneDietary(e.target.value)}
                />
              </div>
            )}
          </div>
        )}
        <TextAreaField
          label={`${reply.full_name.split(" ")[0]}'s dietary requirements`}
          optional
          rows={2}
          hint="Shared across all events."
          value={dietary}
          onChange={(e) => setDietary(e.target.value)}
        />
        <TextAreaField
          label="Message for the couple"
          optional
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
    </Modal>
  );
}
