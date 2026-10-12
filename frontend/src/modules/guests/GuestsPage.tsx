import { useMemo, useState } from "react";
import type { EventInvitation, Guest, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { SearchInput } from "../../components/fields";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { copyText, matches, rsvpLink } from "../../lib/utils";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import {
  exportGuests,
  useBulkInvite,
  useBulkRemove,
  useDeleteGuest,
  useGuests,
  useRemoveInvitation,
  useSetInvitation,
} from "./api";
import { GuestFormModal } from "./GuestFormModal";
import { GuestTable } from "./GuestTable";
import { ImportDialog } from "./ImportDialog";
import "./guests.css";

const NO_GROUP = "\u0000none";

export default function GuestsPage() {
  const wedding = useWedding();
  const events = useEvents();
  const { canEdit } = useSession();
  const guestsQuery = useGuests(wedding.id);
  const toast = useToast();
  const confirm = useConfirm();

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Guest | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const setInvitation = useSetInvitation(wedding.id);
  const removeInvitation = useRemoveInvitation(wedding.id);
  const deleteGuest = useDeleteGuest(wedding.id);

  const guests = useMemo(() => guestsQuery.data ?? [], [guestsQuery.data]);
  const groups = useMemo(
    () => [...new Set(guests.map((g) => g.group_name).filter((g): g is string => Boolean(g)))].sort(),
    [guests],
  );
  const visible = useMemo(
    () =>
      guests.filter(
        (g) =>
          matches([g.full_name, g.email, g.group_name, g.phone], search) &&
          (!group || (group === NO_GROUP ? !g.group_name : g.group_name === group)),
      ),
    [guests, search, group],
  );
  const selectedVisible = visible.filter((g) => selected.has(g.id));

  const changeFilter = (fn: () => void) => {
    fn();
    setSelected(new Set());
  };

  const onToggleInvite = async (guest: Guest, event: WeddingEvent, invited: boolean) => {
    try {
      if (invited) {
        await setInvitation.mutateAsync({ guestId: guest.id, eventId: event.id, plusOne: false });
        return;
      }
      const inv = guest.invitations.find((i) => i.event_id === event.id);
      if (inv && (inv.rsvp_status !== "pending" || inv.first_sent_at)) {
        const ok = await confirm({
          title: `Remove ${guest.full_name} from ${event.name}?`,
          message:
            inv.rsvp_status !== "pending"
              ? `${guest.first_name} has already replied (${inv.rsvp_status}). Their reply and any seat at ${event.name} will be deleted.`
              : `${guest.first_name}'s invitation has already been sent. ${event.name} will disappear from their RSVP page.`,
          confirmLabel: "Remove invitation",
          tone: "danger",
        });
        if (!ok) return;
      }
      await removeInvitation.mutateAsync({ guestId: guest.id, eventId: event.id });
    } catch (err) {
      toast.error(err);
    }
  };

  const onTogglePlusOne = async (guest: Guest, event: WeddingEvent, inv: EventInvitation) => {
    if (inv.plus_one_allowed && inv.plus_one_attending) {
      const ok = await confirm({
        title: "Remove the plus-one?",
        message: `${guest.first_name} said ${inv.plus_one_name || "a guest"} is coming with them to ${event.name}. That will be removed.`,
        confirmLabel: "Remove plus-one",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      await setInvitation.mutateAsync({ guestId: guest.id, eventId: event.id, plusOne: !inv.plus_one_allowed });
    } catch (err) {
      toast.error(err);
    }
  };

  const onDelete = async (guest: Guest) => {
    const ok = await confirm({
      title: `Delete ${guest.full_name}?`,
      message: "Their invitations, replies, seats and seating rules will be deleted too. This can't be undone.",
      confirmLabel: "Delete guest",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteGuest.mutateAsync(guest.id);
      setSelected((s) => {
        const next = new Set(s);
        next.delete(guest.id);
        return next;
      });
      toast.success(`${guest.full_name} deleted.`);
    } catch (err) {
      toast.error(err);
    }
  };

  const onCopyLink = async (guest: Guest) => {
    try {
      await copyText(rsvpLink(guest.rsvp_token));
      const anySent = guest.invitations.some((i) => i.first_sent_at);
      toast.success(
        anySent
          ? `${guest.first_name}'s RSVP link copied.`
          : `${guest.first_name}'s RSVP link copied. Events appear on it once their invitation is sent or marked as sent.`,
      );
    } catch (err) {
      toast.error(err);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      await exportGuests(wedding.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  const counts = events.map((e) => {
    const invs = guests.flatMap((g) => g.invitations.filter((i) => i.event_id === e.id));
    return { event: e, invited: invs.length, plusOnes: invs.filter((i) => i.plus_one_allowed).length };
  });

  return (
    <div className="stack">
      <PageHeader
        title="Guests"
        subtitle={
          guestsQuery.isSuccess ? (
            <>
              {pluralize(guests.length, "guest")}
              {counts.map((c) => (
                <span key={c.event.id} className="dot-sep">
                  {c.event.name}: {c.invited} invited
                  {c.plusOnes > 0 && ` (+${c.plusOnes} plus-ones)`}
                </span>
              ))}
            </>
          ) : (
            "Who's invited to what."
          )
        }
        actions={
          <>
            {canEdit && (
              <Button icon="upload" onClick={() => setImporting(true)}>
                Import CSV
              </Button>
            )}
            <Button icon="download" onClick={() => void onExport()} loading={exporting} disabled={!guests.length}>
              Export CSV
            </Button>
            {canEdit && (
              <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
                Add guest
              </Button>
            )}
          </>
        }
      />

      {guestsQuery.isPending ? (
        <PageLoader label="Loading guests…" />
      ) : guestsQuery.isError ? (
        <ErrorState error={guestsQuery.error} onRetry={() => void guestsQuery.refetch()} />
      ) : guests.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="users"
            title="Your guest list is empty"
            actions={
              canEdit && (
                <>
                  <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
                    Add a guest
                  </Button>
                  <Button icon="upload" onClick={() => setImporting(true)}>
                    Import a spreadsheet
                  </Button>
                </>
              )
            }
          >
            Add guests one by one, or import them from a spreadsheet. Then tick which events each guest is invited to.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <SearchInput
              label="Search guests"
              placeholder="Search name, email, group…"
              value={search}
              onChange={(v) => changeFilter(() => setSearch(v))}
            />
            <select
              className="select select-sm group-filter"
              aria-label="Filter by group"
              value={group}
              onChange={(e) => changeFilter(() => setGroup(e.target.value))}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
              <option value={NO_GROUP}>No group</option>
            </select>
            {(search || group) && (
              <span className="small muted">
                Showing {visible.length} of {guests.length}
              </span>
            )}
          </div>

          {canEdit && selectedVisible.length > 0 && (
            <BulkBar
              weddingId={wedding.id}
              events={events}
              guestIds={selectedVisible.map((g) => g.id)}
              onDone={() => setSelected(new Set())}
            />
          )}

          <GuestTable
            guests={visible}
            events={events}
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
            onSelectAll={(on) => setSelected(on ? new Set(visible.map((g) => g.id)) : new Set())}
            onToggleInvite={(g, e, invited) => void onToggleInvite(g, e, invited)}
            onTogglePlusOne={(g, e, inv) => void onTogglePlusOne(g, e, inv)}
            onEdit={(g) => setEditing(g)}
            onDelete={(g) => void onDelete(g)}
            onCopyLink={(g) => void onCopyLink(g)}
          />
        </>
      )}

      {editing && (
        <GuestFormModal
          weddingId={wedding.id}
          events={events}
          guest={editing === "new" ? null : editing}
          groups={groups}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportDialog weddingId={wedding.id} events={events} onClose={() => setImporting(false)} />}
    </div>
  );
}

function BulkBar({
  weddingId,
  events,
  guestIds,
  onDone,
}: {
  weddingId: string;
  events: WeddingEvent[];
  guestIds: string[];
  onDone: () => void;
}) {
  const [plusOne, setPlusOne] = useState(false);
  const invite = useBulkInvite(weddingId);
  const remove = useBulkRemove(weddingId);
  const toast = useToast();
  const confirm = useConfirm();
  const busy = invite.isPending || remove.isPending;

  const doInvite = async (event: WeddingEvent) => {
    try {
      const res = await invite.mutateAsync({ eventId: event.id, guestIds, plusOne: plusOne ? true : null });
      toast.success(`${pluralize(res.affected, "guest")} invited to ${event.name}${plusOne ? " with a plus-one" : ""}.`);
      onDone();
    } catch (err) {
      toast.error(err);
    }
  };

  const doRemove = async (event: WeddingEvent) => {
    const ok = await confirm({
      title: `Remove ${pluralize(guestIds.length, "guest")} from ${event.name}?`,
      message: "Any replies and seats they have for this event will be deleted.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const res = await remove.mutateAsync({ eventId: event.id, guestIds });
      toast.success(`${pluralize(res.affected, "guest")} removed from ${event.name}.`);
      onDone();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <strong>{guestIds.length} selected</strong>
      <span className="bulk-sep" aria-hidden="true" />
      {events.map((e) => (
        <Button key={e.id} size="sm" variant="secondary" disabled={busy} onClick={() => void doInvite(e)}>
          Invite to {e.name}
        </Button>
      ))}
      <label className="checkbox small">
        <input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} />
        <span>with +1</span>
      </label>
      <span className="bulk-sep" aria-hidden="true" />
      {events.map((e) => (
        <Button key={e.id} size="sm" variant="ghost" disabled={busy} onClick={() => void doRemove(e)}>
          Remove from {e.name}
        </Button>
      ))}
      <span className="spacer" />
      <Button size="sm" variant="ghost" icon="close" onClick={onDone}>
        Clear
      </Button>
    </div>
  );
}
