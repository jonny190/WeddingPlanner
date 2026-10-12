import { useMemo, useState } from "react";
import type { ConstraintKind, Guest, SeatingConstraint } from "../../api/types";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { TextField } from "../../components/fields";
import { GuestPicker, type PickerOption } from "../../components/GuestPicker";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toasts";
import { useCreateConstraint, useDeleteConstraint } from "./api";

interface Props {
  weddingId: string;
  guests: Guest[];
  constraints: SeatingConstraint[];
  canEdit: boolean;
}

export const KIND_LABELS: Record<ConstraintKind, string> = {
  apart: "Keep apart",
  together: "Seat together",
};

/** Wedding-wide rules the seating plan must respect. */
export function SeatingRules({ weddingId, guests, constraints, canEdit }: Props) {
  const [kind, setKind] = useState<ConstraintKind>("apart");
  const [guestA, setGuestA] = useState<string | null>(null);
  const [guestB, setGuestB] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const create = useCreateConstraint(weddingId);
  const remove = useDeleteConstraint(weddingId);
  const toast = useToast();
  const confirm = useConfirm();

  const options: PickerOption[] = useMemo(
    () => guests.map((g) => ({ id: g.id, name: g.full_name, detail: g.group_name })),
    [guests],
  );
  const duplicate = constraints.some(
    (c) =>
      (c.guest_a_id === guestA && c.guest_b_id === guestB) || (c.guest_a_id === guestB && c.guest_b_id === guestA),
  );
  const canSubmit = Boolean(guestA && guestB && guestA !== guestB && !duplicate);

  const submit = async () => {
    if (!guestA || !guestB || !canSubmit) return;
    try {
      await create.mutateAsync({ guest_a_id: guestA, guest_b_id: guestB, kind, note: note.trim() || null });
      toast.success(kind === "apart" ? "They'll be kept apart." : "They'll be seated together.");
      setGuestA(null);
      setGuestB(null);
      setNote("");
    } catch (err) {
      toast.error(err);
    }
  };

  const onDelete = async (c: SeatingConstraint) => {
    const ok = await confirm({
      title: "Delete this rule?",
      message: `${KIND_LABELS[c.kind]}: ${c.guest_a_name} and ${c.guest_b_name}.`,
      confirmLabel: "Delete rule",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(c.id);
    } catch (err) {
      toast.error(err);
    }
  };

  const apart = constraints.filter((c) => c.kind === "apart");
  const together = constraints.filter((c) => c.kind === "together");

  return (
    <div className="rules">
      {canEdit && (
        <form
          className="rule-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="segmented" role="group" aria-label="Rule type">
            <button type="button" aria-pressed={kind === "apart"} onClick={() => setKind("apart")}>
              Keep apart
            </button>
            <button type="button" aria-pressed={kind === "together"} onClick={() => setKind("together")}>
              Seat together
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {kind === "apart"
              ? "These two will never be placed at the same table, at any event."
              : "These two will be placed at the same table whenever both are coming."}
          </p>
          <div className="rule-pickers">
            <GuestPicker label="Guest" options={options} value={guestA} onChange={setGuestA} />
            <span className="rule-link" aria-hidden="true">
              {kind === "apart" ? "≠" : "&"}
            </span>
            <GuestPicker
              label={kind === "apart" ? "Keep away from" : "Seat with"}
              options={options.filter((o) => o.id !== guestA)}
              value={guestB}
              onChange={setGuestB}
            />
          </div>
          <TextField
            label="Note"
            optional
            maxLength={255}
            placeholder={kind === "apart" ? "e.g. Recently divorced" : "e.g. Partners"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {duplicate && <p className="inline-error">There is already a rule for these two guests.</p>}
          <div className="form-actions">
            <Button type="submit" variant="primary" icon="plus" disabled={!canSubmit} loading={create.isPending}>
              {kind === "apart" ? "Keep them apart" : "Seat them together"}
            </Button>
          </div>
        </form>
      )}

      <div className="rule-lists">
        {constraints.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            No rules yet. Add one for anyone who shouldn't share a table.
          </p>
        ) : (
          <>
            <RuleList title="Keep apart" rules={apart} canEdit={canEdit} onDelete={onDelete} />
            <RuleList title="Seat together" rules={together} canEdit={canEdit} onDelete={onDelete} />
          </>
        )}
      </div>
    </div>
  );
}

function RuleList({
  title,
  rules,
  canEdit,
  onDelete,
}: {
  title: string;
  rules: SeatingConstraint[];
  canEdit: boolean;
  onDelete: (c: SeatingConstraint) => void;
}) {
  if (rules.length === 0) return null;
  return (
    <div>
      <h4 className="rule-list-title">
        {title} <span className="muted">({rules.length})</span>
      </h4>
      <ul className="list-plain rule-list">
        {rules.map((c) => (
          <li key={c.id}>
            <Badge tone={c.kind === "apart" ? "danger" : "success"}>
              <Icon name={c.kind === "apart" ? "ban" : "heart"} size={12} />
              {KIND_LABELS[c.kind]}
            </Badge>
            <span className="rule-names">
              <strong>{c.guest_a_name}</strong>
              <span className="muted"> {c.kind === "apart" ? "and" : "with"} </span>
              <strong>{c.guest_b_name}</strong>
              {c.note && <span className="small muted"> · {c.note}</span>}
            </span>
            {canEdit && (
              <IconButton icon="trash" tone="danger" label={`Delete rule for ${c.guest_a_name} and ${c.guest_b_name}`} onClick={() => onDelete(c)} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
