import type { Draft } from "../../api/types";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toasts";
import { formatRelative, pluralize } from "../../lib/format";
import { useDeleteDraft } from "./api";

interface Props {
  weddingId: string;
  eventId: string;
  eventName: string;
  drafts: Draft[];
  canEdit: boolean;
  onOpen: (draft: Draft) => void;
  onNew: () => void;
}

export function DraftList({ weddingId, eventId, eventName, drafts, canEdit, onOpen, onNew }: Props) {
  const remove = useDeleteDraft(weddingId, eventId);
  const confirm = useConfirm();
  const toast = useToast();

  const onDelete = async (draft: Draft) => {
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      message:
        draft.sent_count > 0
          ? "Guests who already received it keep their invitation and RSVP link. The draft itself can't be recovered."
          : "This draft and its card design will be deleted.",
      confirmLabel: "Delete draft",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(draft.id);
      toast.success("Draft deleted.");
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Drafts</h2>
          <div className="small muted">Design the card and email for {eventName}, preview it, then send.</div>
        </div>
        {canEdit && (
          <Button variant="primary" icon="plus" onClick={onNew}>
            New draft
          </Button>
        )}
      </header>
      {drafts.length === 0 ? (
        <EmptyState
          icon="envelope"
          title="No invitations yet"
          actions={
            canEdit && (
              <Button variant="primary" icon="plus" onClick={onNew}>
                Create an invitation
              </Button>
            )
          }
        >
          Start from our template: a card design and a warm email, ready for your own touches.
        </EmptyState>
      ) : (
        <ul className="list-plain draft-list">
          {drafts.map((d) => (
            <li key={d.id} className="draft-row">
              <button type="button" className="draft-open" onClick={() => onOpen(d)}>
                <span className="draft-icon" aria-hidden="true">
                  <Icon name="envelope" />
                </span>
                <span className="draft-main">
                  <span className="draft-name">{d.name}</span>
                  <span className="draft-subject">{d.subject}</span>
                </span>
                <span className="draft-meta">
                  <Badge tone={d.status === "sent" ? "success" : "neutral"} dot>
                    {d.status === "sent" ? "Sent" : "Draft"}
                  </Badge>
                  <span className="tiny muted">
                    {d.sent_count > 0
                      ? `${pluralize(d.sent_count, "email")} · last sent ${formatRelative(d.last_sent_at)}`
                      : `Edited ${formatRelative(d.updated_at)}`}
                  </span>
                </span>
              </button>
              {canEdit && (
                <IconButton
                  icon="trash"
                  tone="danger"
                  label={`Delete ${d.name}`}
                  onClick={() => void onDelete(d)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
