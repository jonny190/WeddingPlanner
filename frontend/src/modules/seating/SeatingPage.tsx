import { useState, type ReactNode } from "react";
import type { SeatingPlan, UnplacedGuest, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { EventTabs, useSelectedEvent } from "../../components/EventTabs";
import { Checkbox } from "../../components/fields";
import { Icon } from "../../components/Icon";
import { Callout, PageHeader } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { PageLoader } from "../../components/Spinner";
import { TabPanel } from "../../components/Tabs";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { cx } from "../../lib/utils";
import { useGuests } from "../guests/api";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import { useAutoArrange, useClearSeats, useConstraints, useSeatingPlan } from "./api";
import { RoomSetup } from "./RoomSetup";
import { SeatingBoard } from "./SeatingBoard";
import { SeatingRules } from "./SeatingRules";
import "./seating.css";

export default function SeatingPage() {
  const wedding = useWedding();
  const events = useEvents();
  const [event, selectEvent] = useSelectedEvent(events);

  return (
    <div className="stack">
      <PageHeader
        title="Seating"
        subtitle="Set up the room, add your rules, then drag guests to their tables or let us arrange them."
      />
      {events.length === 0 || !event ? (
        <div className="card">
          <EmptyState icon="calendar" title="No events yet">
            Add an event in Settings to start a seating plan.
          </EmptyState>
        </div>
      ) : (
        <>
          <EventTabs events={events} value={event.id} onChange={selectEvent} label="Seating plan for" />
          <TabPanel idPrefix="event-tab" activeId={event.id}>
            <EventSeating key={event.id} weddingId={wedding.id} event={event} />
          </TabPanel>
        </>
      )}
    </div>
  );
}

function EventSeating({ weddingId, event }: { weddingId: string; event: WeddingEvent }) {
  const { canEdit } = useSession();
  const plan = useSeatingPlan(weddingId, event.id);
  const constraints = useConstraints(weddingId);
  const guests = useGuests(weddingId);
  const [unplaced, setUnplaced] = useState<UnplacedGuest[] | null>(null);
  const [arranging, setArranging] = useState(false);

  if (plan.isPending) return <PageLoader label="Loading seating plan…" />;
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />;
  const data = plan.data;
  const rules = constraints.data ?? [];
  const apartCount = rules.filter((r) => r.kind === "apart").length;
  const togetherCount = rules.length - apartCount;

  return (
    <div className="stack">
      <StatsBar plan={data} />

      {canEdit && (
        <div className="row seating-actions">
          <Button
            variant="primary"
            icon="sparkles"
            onClick={() => setArranging(true)}
            disabled={data.tables.length === 0}
            title={data.tables.length === 0 ? "Add tables first" : undefined}
          >
            Auto-arrange
          </Button>
          <ClearButton weddingId={weddingId} eventId={event.id} plan={data} />
          {data.stats.seats_needed > data.stats.total_capacity && data.tables.length > 0 && (
            <span className="small" style={{ color: "var(--c-warning)" }}>
              <Icon name="alert" size={14} /> {data.stats.seats_needed - data.stats.total_capacity} more seats needed
              than the tables hold.
            </span>
          )}
        </div>
      )}

      {data.violations.length > 0 && (
        <Callout tone="danger" icon="alert">
          <strong>
            {pluralize(data.violations.length, "seating rule")} {data.violations.length === 1 ? "is" : "are"} broken
          </strong>
          <ul className="violation-list">
            {data.violations.map((v, i) => (
              <li key={`${v.kind}-${i}`}>{v.message}</li>
            ))}
          </ul>
        </Callout>
      )}

      {unplaced && <UnplacedPanel unplaced={unplaced} onDismiss={() => setUnplaced(null)} />}

      <Disclosure
        initialOpen={canEdit && data.tables.length === 0}
        title={
          <>
            <Icon name="table" /> Room setup
          </>
        }
        meta={`${pluralize(data.stats.tables, "table")}, ${pluralize(data.stats.total_capacity, "seat")}`}
      >
        {canEdit ? (
          <RoomSetup weddingId={weddingId} eventId={event.id} eventName={event.name} plan={data} />
        ) : (
          <p className="muted small">Only editors can change the room layout.</p>
        )}
      </Disclosure>

      <Disclosure
        initialOpen={false}
        title={
          <>
            <Icon name="ban" /> Seating rules
          </>
        }
        meta={
          <>
            {rules.length === 0
              ? "Keep people apart, or together"
              : [apartCount && `${apartCount} keep apart`, togetherCount && `${togetherCount} seat together`]
                  .filter(Boolean)
                  .join(", ")}
            <span className="tiny"> · apply to every event</span>
          </>
        }
      >
        {constraints.isError ? (
          <ErrorState compact error={constraints.error} onRetry={() => void constraints.refetch()} />
        ) : (
          <SeatingRules weddingId={weddingId} guests={guests.data ?? []} constraints={rules} canEdit={canEdit} />
        )}
      </Disclosure>

      <SeatingBoard weddingId={weddingId} eventId={event.id} plan={data} canEdit={canEdit} />

      {arranging && (
        <AutoArrangeDialog
          weddingId={weddingId}
          event={event}
          onClose={() => setArranging(false)}
          onDone={(list) => {
            setUnplaced(list);
            setArranging(false);
          }}
        />
      )}
    </div>
  );
}

/** A collapsible card section that remembers being opened or closed. */
function Disclosure({
  initialOpen,
  title,
  meta,
  children,
}: {
  initialOpen: boolean;
  title: ReactNode;
  meta: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details className="card setup-section" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="summary-title">{title}</span>
        <span className="small muted">{meta}</span>
        <Icon name="chevronDown" className="summary-chevron" />
      </summary>
      <div className="setup-body">{children}</div>
    </details>
  );
}

function StatsBar({ plan }: { plan: SeatingPlan }) {
  const s = plan.stats;
  const items: { label: string; value: number; tone?: "warning" | "success" }[] = [
    { label: "Tables", value: s.tables },
    { label: "Seats", value: s.total_capacity },
    { label: "Seats needed", value: s.seats_needed, tone: s.seats_needed > s.total_capacity ? "warning" : undefined },
    { label: "Seats assigned", value: s.seats_assigned },
    {
      label: "Guests unassigned",
      value: s.guests_unassigned,
      tone: s.guests_unassigned > 0 ? "warning" : s.seats_needed > 0 ? "success" : undefined,
    },
  ];
  return (
    <dl className="stats-bar">
      {items.map((item) => (
        <div key={item.label} className={cx("stats-item", item.tone)}>
          <dt>{item.label}</dt>
          <dd className="num">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ClearButton({ weddingId, eventId, plan }: { weddingId: string; eventId: string; plan: SeatingPlan }) {
  const clear = useClearSeats(weddingId, eventId);
  const confirm = useConfirm();
  const toast = useToast();
  const seated = plan.tables.reduce((n, t) => n + t.guests.length, 0);
  const locked = plan.tables.reduce((n, t) => n + t.guests.filter((g) => g.locked).length, 0);
  return (
    <Button
      icon="refresh"
      disabled={seated === 0 || seated === locked}
      loading={clear.isPending}
      onClick={async () => {
        const ok = await confirm({
          title: "Clear the seating plan?",
          message:
            locked > 0
              ? `Everyone will be unseated except the ${pluralize(locked, "locked seat")}. Tables are kept.`
              : "Everyone will be moved back to unassigned. Tables are kept.",
          confirmLabel: "Clear seats",
          tone: "danger",
        });
        if (!ok) return;
        try {
          await clear.mutateAsync(true);
          toast.success("Seating plan cleared.");
        } catch (err) {
          toast.error(err);
        }
      }}
    >
      Clear
    </Button>
  );
}

function AutoArrangeDialog({
  weddingId,
  event,
  onClose,
  onDone,
}: {
  weddingId: string;
  event: WeddingEvent;
  onClose: () => void;
  onDone: (unplaced: UnplacedGuest[]) => void;
}) {
  const [includePending, setIncludePending] = useState(true);
  const [keepLocked, setKeepLocked] = useState(true);
  const arrange = useAutoArrange(weddingId, event.id);
  const toast = useToast();

  const run = async () => {
    try {
      const result = await arrange.mutateAsync({ include_pending: includePending, keep_locked: keepLocked });
      if (result.unplaced.length === 0) toast.success("Everyone has a seat, and every rule is respected.");
      else toast.info(`${pluralize(result.unplaced.length, "guest")} couldn't be placed. See why below.`);
      onDone(result.unplaced);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      dismissible={!arrange.isPending}
      title="Auto-arrange seats"
      description={`We'll draft a plan for ${event.name} that keeps groups together and respects every seating rule.`}
      onSubmit={() => void run()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={arrange.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon="sparkles" loading={arrange.isPending}>
            Arrange seats
          </Button>
        </>
      }
    >
      <div className="stack-sm">
        <Checkbox
          label="Include guests who haven't replied"
          hint="Saves them a seat, assuming they'll come. Guests who declined are never seated."
          checked={includePending}
          onChange={(e) => setIncludePending(e.target.checked)}
        />
        <Checkbox
          label="Keep locked seats where they are"
          hint="Everyone else is re-arranged."
          checked={keepLocked}
          onChange={(e) => setKeepLocked(e.target.checked)}
        />
      </div>
    </Modal>
  );
}

function UnplacedPanel({ unplaced, onDismiss }: { unplaced: UnplacedGuest[]; onDismiss: () => void }) {
  if (unplaced.length === 0) {
    return (
      <div className="callout callout-success">
        <Icon name="checkCircle" />
        <div style={{ flex: 1 }}>Auto-arrange placed everyone. Review the tables and lock any seats you're happy with.</div>
        <IconButton icon="close" label="Dismiss" onClick={onDismiss} />
      </div>
    );
  }
  return (
    <div className="callout callout-warning">
      <Icon name="alert" />
      <div style={{ flex: 1 }}>
        <strong>{pluralize(unplaced.length, "guest")} couldn't be placed:</strong>
        <ul className="violation-list">
          {unplaced.map((u) => (
            <li key={u.guest_id}>
              <strong>{u.full_name}</strong>: {u.reason}
            </li>
          ))}
        </ul>
        <span className="small">Add tables or seats, adjust your rules, or seat them by hand.</span>
      </div>
      <IconButton icon="close" label="Dismiss" onClick={onDismiss} />
    </div>
  );
}
