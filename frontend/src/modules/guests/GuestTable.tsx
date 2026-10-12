import type { EventInvitation, Guest, WeddingEvent } from "../../api/types";
import { RsvpBadge } from "../../components/Badge";
import { IconButton } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { cx } from "../../lib/utils";
import { AGE_GROUP_LABELS } from "./GuestFormModal";

export interface GuestTableProps {
  guests: Guest[];
  events: WeddingEvent[];
  canEdit: boolean;
  selected: Set<string>;
  onSelect: (guestId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onToggleInvite: (guest: Guest, event: WeddingEvent, invited: boolean) => void;
  onTogglePlusOne: (guest: Guest, event: WeddingEvent, invitation: EventInvitation) => void;
  onEdit: (guest: Guest) => void;
  onDelete: (guest: Guest) => void;
  onCopyLink: (guest: Guest) => void;
}

export function GuestTable({
  guests,
  events,
  canEdit,
  selected,
  onSelect,
  onSelectAll,
  onToggleInvite,
  onTogglePlusOne,
  onEdit,
  onDelete,
  onCopyLink,
}: GuestTableProps) {
  const allSelected = guests.length > 0 && guests.every((g) => selected.has(g.id));
  const someSelected = !allSelected && guests.some((g) => selected.has(g.id));

  return (
    <div className="table-wrap">
      <table className="table guest-table">
        <thead>
          <tr>
            {canEdit && (
              <th className="col-check">
                <input
                  type="checkbox"
                  aria-label="Select all shown guests"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                />
              </th>
            )}
            <th>Guest</th>
            {events.map((e) => (
              <th key={e.id} className="col-event">
                {e.name}
                <div className="col-event-sub">Invited · +1 · Reply</div>
              </th>
            ))}
            <th className="col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {guests.map((g) => (
            <tr key={g.id} className={selected.has(g.id) ? "selected" : undefined}>
              {canEdit && (
                <td className="col-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${g.full_name}`}
                    checked={selected.has(g.id)}
                    onChange={(e) => onSelect(g.id, e.target.checked)}
                  />
                </td>
              )}
              <td className="col-guest">
                <div className="cell-title">
                  {canEdit ? (
                    <button type="button" className="guest-name-btn" onClick={() => onEdit(g)}>
                      {g.full_name}
                    </button>
                  ) : (
                    g.full_name
                  )}
                </div>
                <div className="cell-sub">
                  {g.email ? (
                    <span className="guest-email">{g.email}</span>
                  ) : (
                    <span className="no-email">No email</span>
                  )}
                  {g.phone && <span className="dot-sep">{g.phone}</span>}
                </div>
                <div className="guest-tags">
                  {g.group_name && <span className="tag">{g.group_name}</span>}
                  {g.age_group !== "adult" && <span className="tag">{AGE_GROUP_LABELS[g.age_group]}</span>}
                  {g.dietary_requirements && (
                    <span className="tag tag-diet" title={`Dietary: ${g.dietary_requirements}`}>
                      {g.dietary_requirements.length > 24
                        ? `${g.dietary_requirements.slice(0, 22)}…`
                        : g.dietary_requirements}
                    </span>
                  )}
                </div>
              </td>
              {events.map((e) => {
                const inv = g.invitations.find((i) => i.event_id === e.id);
                return (
                  <td key={e.id} className="col-event">
                    <div className="invite-cell">
                      <input
                        type="checkbox"
                        aria-label={`${g.full_name} invited to ${e.name}`}
                        checked={Boolean(inv)}
                        disabled={!canEdit}
                        onChange={(ev) => onToggleInvite(g, e, ev.target.checked)}
                      />
                      <button
                        type="button"
                        className={cx("plus-one-toggle", inv?.plus_one_allowed && "on")}
                        aria-pressed={Boolean(inv?.plus_one_allowed)}
                        aria-label={`${g.full_name} can bring a guest to ${e.name}`}
                        title={
                          inv
                            ? inv.plus_one_allowed
                              ? "Plus-one allowed (click to remove)"
                              : "Allow a plus-one"
                            : "Invite first to allow a plus-one"
                        }
                        disabled={!canEdit || !inv}
                        onClick={() => inv && onTogglePlusOne(g, e, inv)}
                      >
                        +1
                      </button>
                      {inv && <RsvpBadge status={inv.rsvp_status} short />}
                    </div>
                    {inv?.plus_one_attending && (
                      <div className="tiny muted">+1 {inv.plus_one_name || "Guest"} coming</div>
                    )}
                  </td>
                );
              })}
              <td className="col-actions">
                <IconButton icon="link" label={`Copy ${g.first_name}'s RSVP link`} onClick={() => onCopyLink(g)} />
                {canEdit && (
                  <>
                    <IconButton icon="edit" label={`Edit ${g.full_name}`} onClick={() => onEdit(g)} />
                    <IconButton icon="trash" tone="danger" label={`Delete ${g.full_name}`} onClick={() => onDelete(g)} />
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {guests.length === 0 && (
        <div className="empty-state compact">
          <Icon name="search" />
          <p>No guests match your filters.</p>
        </div>
      )}
    </div>
  );
}
