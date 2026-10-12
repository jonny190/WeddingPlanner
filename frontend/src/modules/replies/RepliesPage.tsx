import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Engagement, ReplyRow, RsvpStatus, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { ENGAGEMENT_LABELS } from "../../components/Badge";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { EventTabs, useSelectedEvent } from "../../components/EventTabs";
import { SearchInput } from "../../components/fields";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { TabPanel } from "../../components/Tabs";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { copyText, matches, rsvpLink } from "../../lib/utils";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import { exportReplies, useMarkSent, useReplies, useReplySummary, type ReplyFilters } from "./api";
import { RecordReplyModal } from "./RecordReplyModal";
import { RepliesTable } from "./RepliesTable";
import { ReplySummaryCards } from "./ReplySummaryCards";
import "./replies.css";

const STATUSES: RsvpStatus[] = ["pending", "attending", "declined"];
const STATUS_LABELS: Record<RsvpStatus, string> = {
  pending: "Awaiting reply",
  attending: "Attending",
  declined: "Declined",
};
const ENGAGEMENTS: Engagement[] = ["not_sent", "sent", "opened", "responded"];

export default function RepliesPage() {
  const wedding = useWedding();
  const events = useEvents();
  const [event, selectEvent] = useSelectedEvent(events, ["status", "engagement"]);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!event) return;
    setExporting(true);
    try {
      await exportReplies(wedding.id, event.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Replies"
        subtitle="Who's coming, who isn't, and who has opened their invitation without replying."
        actions={
          event && (
            <Button icon="download" onClick={() => void onExport()} loading={exporting}>
              Export CSV
            </Button>
          )
        }
      />
      {!event ? (
        <div className="card">
          <EmptyState icon="calendar" title="No events yet">
            Add an event in Settings to start collecting replies.
          </EmptyState>
        </div>
      ) : (
        <>
          <EventTabs events={events} value={event.id} onChange={selectEvent} label="Replies for" />
          <TabPanel idPrefix="event-tab" activeId={event.id}>
            <EventReplies key={event.id} weddingId={wedding.id} event={event} />
          </TabPanel>
        </>
      )}
    </div>
  );
}

function EventReplies({ weddingId, event }: { weddingId: string; event: WeddingEvent }) {
  const { canEdit } = useSession();
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("status");
  const engagementParam = params.get("engagement");
  const filters: ReplyFilters = {
    status: STATUSES.includes(statusParam as RsvpStatus) ? (statusParam as RsvpStatus) : "",
    engagement: ENGAGEMENTS.includes(engagementParam as Engagement) ? (engagementParam as Engagement) : "",
  };
  const summary = useReplySummary(weddingId, event.id);
  const replies = useReplies(weddingId, event.id, filters);
  const markSent = useMarkSent(weddingId, event.id);
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState<ReplyRow | null>(null);

  const setFilters = (changes: Partial<Record<keyof ReplyFilters, string>>) => {
    setSelected(new Set());
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  };

  const rows = (replies.data ?? []).filter((r) => matches([r.full_name, r.email, r.group_name], search));
  const selectedRows = rows.filter((r) => selected.has(r.guest_id));
  const reminderLink = `/weddings/${weddingId}/invitations?event=${event.id}&tab=send&audience=opened_no_reply`;

  const doMarkSent = async (targets: ReplyRow[]) => {
    const alreadySent = targets.filter((r) => r.engagement !== "not_sent").length;
    const ok = await confirm({
      title: `Mark ${pluralize(targets.length, "invitation")} as sent?`,
      message: (
        <>
          Use this for invitations you posted or handed over. Their RSVP link starts showing {event.name}, and they
          won't be included when you send to "guests who haven't been sent it yet".
          {alreadySent > 0 && ` ${pluralize(alreadySent, "of them was", "of them were")} already sent.`}
        </>
      ),
      confirmLabel: "Mark as sent",
    });
    if (!ok) return;
    try {
      const res = await markSent.mutateAsync(targets.map((r) => r.guest_id));
      toast.success(`${pluralize(res.affected, "invitation")} marked as sent.`);
      setSelected(new Set());
    } catch (err) {
      toast.error(err);
    }
  };

  const onCopyLink = async (row: ReplyRow) => {
    try {
      await copyText(rsvpLink(row.rsvp_token));
      toast.success(
        row.engagement === "not_sent"
          ? `${row.full_name}'s RSVP link copied. ${event.name} appears on it once the invitation is sent or marked as sent.`
          : `${row.full_name}'s RSVP link copied.`,
      );
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="stack">
      {summary.isPending ? (
        <PageLoader label="Loading summary…" />
      ) : summary.isError ? (
        <ErrorState compact error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <ReplySummaryCards
          summary={summary.data}
          reminderLink={reminderLink}
          canEdit={canEdit}
          onShowOpened={() => {
            setFilters({ engagement: "opened" });
            document.getElementById("replies-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}

      <section className="stack-sm" id="replies-list">
        <div className="toolbar">
          <SearchInput label="Search guests" placeholder="Search name, email, group…" value={search} onChange={setSearch} />
          <select
            className="select select-sm filter-select"
            aria-label="Filter by reply"
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value })}
          >
            <option value="">All replies</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="select select-sm filter-select"
            aria-label="Filter by invitation progress"
            value={filters.engagement}
            onChange={(e) => setFilters({ engagement: e.target.value })}
          >
            <option value="">Any progress</option>
            {ENGAGEMENTS.map((e) => (
              <option key={e} value={e}>
                {ENGAGEMENT_LABELS[e]}
              </option>
            ))}
          </select>
          {(filters.status || filters.engagement) && (
            <button
              type="button"
              className="link-btn small"
              onClick={() => setFilters({ status: "", engagement: "" })}
            >
              Clear filters
            </button>
          )}
        </div>

        {canEdit && selectedRows.length > 0 && (
          <div className="bulk-bar" role="region" aria-label="Bulk actions">
            <strong>{selectedRows.length} selected</strong>
            <Button size="sm" variant="secondary" icon="mail" onClick={() => void doMarkSent(selectedRows)} loading={markSent.isPending}>
              Mark invitations as sent
            </Button>
            <span className="small" style={{ opacity: 0.8 }}>
              For invitations you posted or handed over
            </span>
            <span className="spacer" />
            <Button size="sm" variant="ghost" icon="close" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {replies.isPending ? (
          <PageLoader label="Loading replies…" />
        ) : replies.isError ? (
          <ErrorState error={replies.error} onRetry={() => void replies.refetch()} />
        ) : replies.data.length === 0 && !filters.status && !filters.engagement ? (
          <div className="card">
            <EmptyState icon="inbox" title={`Nobody is invited to ${event.name} yet`}>
              Tick guests' {event.name} box on the Guests page, then send their invitations.
            </EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState compact icon="search" title="No guests match">
              Try a different filter.
            </EmptyState>
          </div>
        ) : (
          <RepliesTable
            rows={rows}
            canEdit={canEdit}
            selected={selected}
            onSelect={(id, on) =>
              setSelected((s) => {
                const next = new Set(s);
                if (on) next.add(id);
                else next.delete(id);
                return next;
              })
            }
            onSelectAll={(on) => setSelected(on ? new Set(rows.map((r) => r.guest_id)) : new Set())}
            onRecord={setRecording}
            onCopyLink={(r) => void onCopyLink(r)}
            onMarkSent={(r) => void doMarkSent([r])}
          />
        )}
      </section>

      {recording && (
        <RecordReplyModal weddingId={weddingId} event={event} reply={recording} onClose={() => setRecording(null)} />
      )}
    </div>
  );
}
