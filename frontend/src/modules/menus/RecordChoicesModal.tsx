import { useState } from "react";
import { errorMessage } from "../../api/client";
import type { ChoiceMap, GuestChoiceRow, MenuCourse, WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { SelectField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { useRecordChoices } from "./api";

interface Props {
  weddingId: string;
  event: WeddingEvent;
  courses: MenuCourse[];
  row: GuestChoiceRow;
  onClose: () => void;
}

/** Write down what a guest (and the person they are bringing) would like, e.g. from a phone call. */
export function RecordChoicesModal({ weddingId, event, courses, row, onClose }: Props) {
  const [guest, setGuest] = useState<ChoiceMap>({ ...row.choices.guest });
  const [plusOne, setPlusOne] = useState<ChoiceMap>({ ...row.choices.plus_one });
  const record = useRecordChoices(weddingId, event.id);
  const toast = useToast();
  const bringing = Boolean(row.plus_one_attending);

  const submit = () => {
    record.mutate(
      { guestId: row.guest_id, data: { guest, plus_one: bringing ? plusOne : {} } },
      {
        onSuccess: (saved) => {
          toast.success(
            saved.complete
              ? `${saved.full_name}'s dishes recorded.`
              : `${saved.full_name}'s dishes recorded, with some still to choose.`,
          );
          onClose();
        },
      },
    );
  };

  const picker = (label: string, value: ChoiceMap, set: (next: ChoiceMap) => void) => (
    <div className="stack-sm">
      <h3 className="section-subtitle">{label}</h3>
      {courses.map((c) => (
        <SelectField
          key={c.id}
          label={c.name}
          value={value[c.id] ?? ""}
          onChange={(e) => {
            const next = { ...value };
            if (e.target.value) next[c.id] = e.target.value;
            else delete next[c.id];
            set(next);
          }}
        >
          <option value="">Not chosen yet</option>
          {c.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
      ))}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dishes for ${row.full_name}`}
      description={`${event.name}. Leave a course as "not chosen yet" if they have not decided.`}
      dismissible={!record.isPending}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={record.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        {picker(row.full_name, guest, setGuest)}
        {bringing && picker(row.plus_one_name || `${row.full_name}'s guest`, plusOne, setPlusOne)}
        {record.isError && <Callout tone="danger">{errorMessage(record.error)}</Callout>}
      </div>
    </Modal>
  );
}
