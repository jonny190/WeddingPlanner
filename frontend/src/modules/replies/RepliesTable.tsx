import type { ReplyRow } from "../../api/types";
import { EngagementBadge, RsvpBadge } from "../../components/Badge";
import { IconButton } from "../../components/Button";
import { formatDateTime, formatRelative } from "../../lib/format";

interface Props {
  rows: ReplyRow[];
  canEdit: boolean;
  selected: Set<string>;
  onSelect: (guestId: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  onRecord: (row: ReplyRow) => void;
  onCopyLink: (row: ReplyRow) => void;
  onMarkSent: (row: ReplyRow) => void;
}

function When({ value }: { value: string | null }) {
  if (!value) return <span className="muted">—</span>;
  return (
    <time dateTime={value} title={formatDateTime(value)}>
      {formatRelative(value)}
    </time>
  );
}

export function RepliesTable({ rows, canEdit, selected, onSelect, onSelectAll, onRecord, onCopyLink, onMarkSent }: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.guest_id));
  const someSelected = !allSelected && rows.some((r) => selected.has(r.guest_id));
  return (
    <div className="table-wrap">
      <table className="table replies-table">
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
            <th>Invitation</th>
            <th>Reply</th>
            <th>Plus-one</th>
            <th>Dietary &amp; message</th>
            <th>Sent</th>
            <th>Opened</th>
            <th>Replied</th>
            <th className="col-actions">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.guest_id} className={selected.has(r.guest_id) ? "selected" : undefined}>
              {canEdit && (
                <td className="col-check">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.full_name}`}
                    checked={selected.has(r.guest_id)}
                    onChange={(e) => onSelect(r.guest_id, e.target.checked)}
                  />
                </td>
              )}
              <td style={{ minWidth: 170 }}>
                <div className="cell-title">{r.full_name}</div>
                <div className="cell-sub">{r.email ?? <span className="no-email">No email</span>}</div>
                {r.group_name && <span className="tag">{r.group_name}</span>}
              </td>
              <td>
                <EngagementBadge engagement={r.engagement} />
              </td>
              <td>
                <RsvpBadge status={r.rsvp_status} />
                {r.response_channel === "manual" && <div className="tiny muted">Recorded by you</div>}
              </td>
              <td className="small" style={{ minWidth: 120 }}>
                {!r.plus_one_allowed ? (
                  <span className="muted">Not invited</span>
                ) : r.plus_one_attending ? (
                  <>
                    <strong>{r.plus_one_name || "Guest"}</strong> coming
                    {r.plus_one_dietary && <div className="tiny muted">Diet: {r.plus_one_dietary}</div>}
                  </>
                ) : r.plus_one_attending === false ? (
                  <span className="muted">Not bringing one</span>
                ) : (
                  <span className="muted">Allowed</span>
                )}
              </td>
              <td className="small" style={{ minWidth: 180, maxWidth: 300 }}>
                {r.dietary_requirements && <div>Diet: {r.dietary_requirements}</div>}
                {r.guest_message && <div className="reply-message">“{r.guest_message}”</div>}
                {!r.dietary_requirements && !r.guest_message && <span className="muted">—</span>}
              </td>
              <td className="small nowrap">
                <When value={r.last_sent_at} />
              </td>
              <td className="small nowrap">
                <When value={r.last_clicked_at} />
                {r.click_count > 0 && (
                  <div className="tiny muted">
                    {r.click_count} {r.click_count === 1 ? "click" : "clicks"}
                  </div>
                )}
              </td>
              <td className="small nowrap">
                <When value={r.responded_at} />
              </td>
              <td className="col-actions">
                <IconButton icon="link" label={`Copy ${r.full_name}'s RSVP link`} onClick={() => onCopyLink(r)} />
                {canEdit && (
                  <>
                    <IconButton icon="phone" label={`Record ${r.full_name}'s reply`} onClick={() => onRecord(r)} />
                    {r.engagement === "not_sent" && (
                      <IconButton
                        icon="mail"
                        label={`Mark ${r.full_name}'s invitation as sent (posted or handed over)`}
                        onClick={() => onMarkSent(r)}
                      />
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
