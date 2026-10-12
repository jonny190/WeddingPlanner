import type { EventReplySummary } from "../../api/types";
import { ButtonLink } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ProgressBar, StatTile } from "../../components/misc";
import { pluralize } from "../../lib/format";

interface Props {
  summary: EventReplySummary;
  reminderLink: string;
  canEdit: boolean;
  onShowOpened: () => void;
}

export function ReplySummaryCards({ summary: s, reminderLink, canEdit, onShowOpened }: Props) {
  const replied = s.attending + s.declined;
  return (
    <div className="stack">
      <div className="opened-highlight" role="region" aria-label="Opened but not replied">
        <div className="opened-figure">
          <span className="opened-number num">{s.opened_no_reply}</span>
          <span className="opened-label">
            opened the invitation
            <br />
            but haven't replied
          </span>
        </div>
        <p className="opened-text">
          {s.opened_no_reply > 0
            ? "They've seen it, so a friendly reminder usually does the trick."
            : s.invites_sent > 0
              ? "Nobody is sitting on an opened invitation right now."
              : "When guests open the link in their email, you'll see who still needs to reply here."}
          <span className="tiny muted" style={{ display: "block", marginTop: 4 }}>
            {s.opened} of {pluralize(s.invites_sent, "sent invitation")} opened so far.
          </span>
        </p>
        {s.opened_no_reply > 0 && (
          <div className="opened-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onShowOpened}>
              <Icon name="eye" /> Show them
            </button>
            {canEdit && (
              <ButtonLink to={reminderLink} variant="primary" size="sm" icon="send">
                Send reminder to guests who opened but haven't replied
              </ButtonLink>
            )}
          </div>
        )}
      </div>

      <div className="stat-grid">
        <StatTile label="Attending" value={s.attending} hint={s.plus_ones_attending ? `+${s.plus_ones_attending} plus-ones` : undefined} />
        <StatTile label="Declined" value={s.declined} />
        <StatTile label="Awaiting reply" value={s.pending} />
        <StatTile label="Confirmed headcount" value={s.confirmed_headcount} hint={s.children_attending ? `incl. ${s.children_attending} children` : undefined} />
        <StatTile label="Potential headcount" value={s.potential_headcount} hint="If everyone yet to reply comes" />
        <StatTile label="Invitations sent" value={`${s.invites_sent}/${s.invited}`} hint={s.invites_not_sent ? `${s.invites_not_sent} not sent yet` : "All sent"} />
      </div>
      {s.invited > 0 && (
        <div className="reply-progress">
          <ProgressBar
            label="Replies received"
            total={s.invited}
            segments={[
              { value: s.attending, tone: "success", label: "Attending" },
              { value: s.declined, tone: "danger", label: "Declined" },
            ]}
          />
          <span className="tiny muted">
            {replied} of {pluralize(s.invited, "guest")} replied
          </span>
        </div>
      )}
    </div>
  );
}
