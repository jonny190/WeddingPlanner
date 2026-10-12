import { useMemo, useState, type DragEvent, type ReactElement } from "react";
import type { SeatedGuest, SeatingPlan, TablePlan, TableShape } from "../../api/types";
import { Badge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { SearchInput } from "../../components/fields";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { cx, matches } from "../../lib/utils";
import { useAssignSeat, useDeleteTable, useUpdateTable } from "./api";

const DRAG_TYPE = "application/x-wedding-guest";

interface BoardProps {
  weddingId: string;
  eventId: string;
  plan: SeatingPlan;
  canEdit: boolean;
}

/** Tables with their guests, plus the unassigned list. Drag and drop, or use "Move to…". */
export function SeatingBoard({ weddingId, eventId, plan, canEdit }: BoardProps) {
  const assign = useAssignSeat(weddingId, eventId);
  const toast = useToast();
  const [dragging, setDragging] = useState<SeatedGuest | null>(null);

  const violatingGuests = useMemo(() => new Set(plan.violations.flatMap((v) => v.guest_ids)), [plan.violations]);
  const violatingTables = useMemo(() => new Set(plan.violations.flatMap((v) => v.table_ids)), [plan.violations]);
  const allGuests = useMemo(
    () => [...plan.unassigned, ...plan.tables.flatMap((t) => t.guests)],
    [plan.unassigned, plan.tables],
  );

  const move = async (guest: SeatedGuest, tableId: string | null, locked = guest.locked) => {
    try {
      await assign.mutateAsync({ guestId: guest.guest_id, table_id: tableId, locked: tableId ? locked : false });
    } catch (err) {
      // 409: table full, or a "keep apart" rule. The API explains which.
      toast.error(err);
    }
  };

  const ctx: GuestRowContext = {
    canEdit,
    tables: plan.tables,
    violatingGuests,
    onMove: (g, tableId) => void move(g, tableId),
    onToggleLock: (g, tableId) => void move(g, tableId, !g.locked),
    onDragStart: setDragging,
    onDragEnd: () => setDragging(null),
  };

  const dropGuest = (e: DragEvent, tableId: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_TYPE) || e.dataTransfer.getData("text/plain");
    setDragging(null);
    const guest = allGuests.find((g) => g.guest_id === id);
    if (!guest) return;
    const current = plan.tables.find((t) => t.guests.some((g) => g.guest_id === id));
    if ((current?.id ?? null) === tableId) return;
    void move(guest, tableId);
  };

  return (
    <div className={cx("seating-board", assign.isPending && "is-saving")}>
      <div className="tables-area">
        {plan.tables.length === 0 ? (
          <div className="card">
            <div className="empty-state compact">
              <div className="empty-icon">
                <Icon name="table" />
              </div>
              <h3>No tables yet</h3>
              <p>Use Room setup above to add tables for this event.</p>
            </div>
          </div>
        ) : (
          <div className="tables-grid">
            {plan.tables.map((table) => (
              <TableCard
                key={table.id}
                weddingId={weddingId}
                eventId={eventId}
                table={table}
                ctx={ctx}
                dragging={dragging}
                hasViolation={violatingTables.has(table.id)}
                onDrop={(e) => dropGuest(e, table.id)}
              />
            ))}
          </div>
        )}
      </div>
      <UnassignedPanel plan={plan} ctx={ctx} dragging={dragging} onDrop={(e) => dropGuest(e, null)} />
    </div>
  );
}

interface GuestRowContext {
  canEdit: boolean;
  tables: TablePlan[];
  violatingGuests: Set<string>;
  onMove: (guest: SeatedGuest, tableId: string | null) => void;
  onToggleLock: (guest: SeatedGuest, tableId: string) => void;
  onDragStart: (guest: SeatedGuest) => void;
  onDragEnd: () => void;
}

function useDropZone(enabled: boolean, onDrop: (e: DragEvent) => void) {
  const [over, setOver] = useState(false);
  const handlers = enabled
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (!over) setOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setOver(false);
        },
        onDrop: (e: DragEvent) => {
          setOver(false);
          onDrop(e);
        },
      }
    : {};
  return { over, handlers };
}

function TableCard({
  weddingId,
  eventId,
  table,
  ctx,
  dragging,
  hasViolation,
  onDrop,
}: {
  weddingId: string;
  eventId: string;
  table: TablePlan;
  ctx: GuestRowContext;
  dragging: SeatedGuest | null;
  hasViolation: boolean;
  onDrop: (e: DragEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const { over, handlers } = useDropZone(ctx.canEdit, onDrop);
  const full = table.seats_used >= table.capacity;
  const over_capacity = table.seats_used > table.capacity;
  const wouldOverflow = dragging ? table.seats_used + dragging.seats > table.capacity : false;
  const free = table.capacity - table.seats_used;

  return (
    <article
      className={cx(
        "table-card",
        over && "drop-over",
        over && wouldOverflow && "drop-full",
        hasViolation && "has-violation",
      )}
      aria-label={`${table.name}, ${table.seats_used} of ${table.capacity} seats used`}
      {...handlers}
    >
      {editing ? (
        <TableEditor weddingId={weddingId} eventId={eventId} table={table} onDone={() => setEditing(false)} />
      ) : (
        <header className="table-card-head">
          <div style={{ minWidth: 0 }}>
            <h3 className="table-name">{table.name}</h3>
            <span
              className={cx("seat-count", full && "full", over_capacity && "over")}
              title={`${free >= 0 ? free : 0} seats free`}
            >
              {table.seats_used}/{table.capacity}
            </span>
          </div>
          {ctx.canEdit && (
            <div className="table-actions">
              <IconButton icon="edit" label={`Edit ${table.name}`} onClick={() => setEditing(true)} />
              <DeleteTableButton weddingId={weddingId} eventId={eventId} table={table} />
            </div>
          )}
        </header>
      )}
      <TableVisual shape={table.shape} capacity={table.capacity} used={table.seats_used} />
      {hasViolation && (
        <div className="table-warning">
          <Icon name="alert" size={14} /> Breaks a seating rule
        </div>
      )}
      {table.guests.length === 0 ? (
        <p className="drop-hint">{ctx.canEdit ? "Drag guests here" : "Nobody seated yet"}</p>
      ) : (
        <ul className="list-plain seated-list">
          {table.guests.map((g) => (
            <GuestRow key={g.guest_id} guest={g} tableId={table.id} ctx={ctx} />
          ))}
        </ul>
      )}
    </article>
  );
}

function DeleteTableButton({ weddingId, eventId, table }: { weddingId: string; eventId: string; table: TablePlan }) {
  const remove = useDeleteTable(weddingId, eventId);
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <IconButton
      icon="trash"
      tone="danger"
      label={`Delete ${table.name}`}
      disabled={remove.isPending}
      onClick={async () => {
        if (table.guests.length > 0) {
          const ok = await confirm({
            title: `Delete ${table.name}?`,
            message: `${pluralize(table.guests.length, "guest")} seated here will move back to unassigned.`,
            confirmLabel: "Delete table",
            tone: "danger",
          });
          if (!ok) return;
        }
        try {
          await remove.mutateAsync(table.id);
        } catch (err) {
          toast.error(err);
        }
      }}
    />
  );
}

function TableEditor({
  weddingId,
  eventId,
  table,
  onDone,
}: {
  weddingId: string;
  eventId: string;
  table: TablePlan;
  onDone: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));
  const [shape, setShape] = useState<TableShape>(table.shape);
  const update = useUpdateTable(weddingId, eventId);
  const toast = useToast();
  const cap = Number(capacity);
  const valid = name.trim().length > 0 && Number.isInteger(cap) && cap >= 1 && cap <= 100;

  return (
    <form
      className="table-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        try {
          await update.mutateAsync({ id: table.id, data: { name: name.trim(), capacity: cap, shape } });
          onDone();
        } catch (err) {
          toast.error(err);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <label className="sr-only" htmlFor={`tn-${table.id}`}>
        Table name
      </label>
      <input
        id={`tn-${table.id}`}
        className="input input-sm"
        value={name}
        maxLength={100}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <label className="sr-only" htmlFor={`tc-${table.id}`}>
          Seats
        </label>
        <input
          id={`tc-${table.id}`}
          className="input input-sm"
          type="number"
          min={1}
          max={100}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          style={{ width: 72 }}
        />
        <label className="sr-only" htmlFor={`ts-${table.id}`}>
          Shape
        </label>
        <select
          id={`ts-${table.id}`}
          className="select select-sm"
          value={shape}
          onChange={(e) => setShape(e.target.value as TableShape)}
        >
          <option value="round">Round</option>
          <option value="rectangle">Rectangular</option>
        </select>
      </div>
      {Number.isInteger(cap) && cap < table.seats_used && (
        <p className="tiny inline-error" style={{ margin: 0 }}>
          {table.seats_used} seats are already taken here.
        </p>
      )}
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" type="submit" variant="primary" disabled={!valid} loading={update.isPending}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function GuestRow({ guest, tableId, ctx }: { guest: SeatedGuest; tableId: string | null; ctx: GuestRowContext }) {
  const violating = ctx.violatingGuests.has(guest.guest_id);
  return (
    <li
      className={cx("seat-guest", guest.locked && "locked", violating && "violating")}
      draggable={ctx.canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, guest.guest_id);
        e.dataTransfer.setData("text/plain", guest.guest_id);
        e.dataTransfer.effectAllowed = "move";
        ctx.onDragStart(guest);
      }}
      onDragEnd={ctx.onDragEnd}
    >
      {ctx.canEdit && <Icon name="grip" className="grip" />}
      <div className="seat-guest-main">
        <div className="seat-guest-name">
          {guest.full_name}
          {violating && (
            <>
              <Icon name="alert" size={13} className="violation-icon" />
              <span className="sr-only">(breaks a seating rule)</span>
            </>
          )}
          {guest.rsvp_status === "pending" && (
            <Badge tone="neutral" title="Hasn't replied yet, so their seat is provisional">
              not replied
            </Badge>
          )}
        </div>
        {guest.seats > 1 && <div className="seat-plus-one">+1 {guest.plus_one_name || "Guest"}</div>}
        {guest.group_name && <div className="tiny muted">{guest.group_name}</div>}
      </div>
      {ctx.canEdit && (
        <div className="seat-guest-actions">
          {tableId && (
            <IconButton
              icon={guest.locked ? "lock" : "unlock"}
              label={guest.locked ? `Unlock ${guest.full_name}'s seat` : `Lock ${guest.full_name}'s seat`}
              aria-pressed={guest.locked}
              onClick={() => ctx.onToggleLock(guest, tableId)}
            />
          )}
          <MoveToSelect guest={guest} tableId={tableId} ctx={ctx} />
        </div>
      )}
    </li>
  );
}

/** Keyboard-accessible alternative to dragging. */
function MoveToSelect({ guest, tableId, ctx }: { guest: SeatedGuest; tableId: string | null; ctx: GuestRowContext }) {
  return (
    <select
      className="move-select"
      aria-label={`Move ${guest.full_name} to…`}
      title="Move to…"
      value=""
      onChange={(e) => {
        const value = e.target.value;
        if (!value) return;
        ctx.onMove(guest, value === "__none" ? null : value);
      }}
    >
      <option value="">Move to…</option>
      {tableId && <option value="__none">Unassigned</option>}
      {ctx.tables
        .filter((t) => t.id !== tableId)
        .map((t) => {
          const free = t.capacity - t.seats_used;
          return (
            <option key={t.id} value={t.id} disabled={free < guest.seats}>
              {t.name} ({free > 0 ? `${free} free` : "full"})
            </option>
          );
        })}
    </select>
  );
}

function UnassignedPanel({
  plan,
  ctx,
  dragging,
  onDrop,
}: {
  plan: SeatingPlan;
  ctx: GuestRowContext;
  dragging: SeatedGuest | null;
  onDrop: (e: DragEvent) => void;
}) {
  const [search, setSearch] = useState("");
  const { over, handlers } = useDropZone(ctx.canEdit, onDrop);
  const visible = plan.unassigned.filter((g) => matches([g.full_name, g.group_name, g.plus_one_name], search));
  const seatsNeeded = plan.unassigned.reduce((s, g) => s + g.seats, 0);
  const draggingFromTable = dragging && !plan.unassigned.some((g) => g.guest_id === dragging.guest_id);

  return (
    <aside
      className={cx("unassigned-panel", over && draggingFromTable && "drop-over")}
      aria-label="Guests without a seat"
      {...handlers}
    >
      <div className="unassigned-head">
        <h3>
          Unassigned <span className="muted">({plan.unassigned.length})</span>
        </h3>
        {plan.unassigned.length > 0 && <span className="tiny muted">{pluralize(seatsNeeded, "seat")} needed</span>}
      </div>
      {plan.unassigned.length > 0 && (
        <SearchInput label="Search unassigned guests" placeholder="Search name or group…" value={search} onChange={setSearch} />
      )}
      {plan.unassigned.length === 0 ? (
        <p className="drop-hint">
          <Icon name="checkCircle" size={16} /> Everyone has a seat.
          {ctx.canEdit && plan.tables.length > 0 && <><br />Drag a guest here to unseat them.</>}
        </p>
      ) : visible.length === 0 ? (
        <p className="drop-hint">No matches.</p>
      ) : (
        <ul className="list-plain seated-list">
          {visible.map((g) => (
            <GuestRow key={g.guest_id} guest={g} tableId={null} ctx={ctx} />
          ))}
        </ul>
      )}
    </aside>
  );
}

/** A small drawing of the table with its seats (filled seats are taken). */
export function TableVisual({ shape, capacity, used }: { shape: TableShape; capacity: number; used: number }) {
  const shown = Math.min(capacity, 24);
  const filled = Math.min(used, shown);
  const r = shown > 14 ? 4 : 5.5;
  const seats: { x: number; y: number }[] = [];
  let table: ReactElement;
  if (shape === "round") {
    const cx0 = 60;
    const cy0 = 46;
    table = <circle cx={cx0} cy={cy0} r={26} className="tv-table" />;
    for (let i = 0; i < shown; i++) {
      const a = (2 * Math.PI * i) / shown - Math.PI / 2;
      seats.push({ x: cx0 + Math.cos(a) * 37, y: cy0 + Math.sin(a) * 37 });
    }
  } else {
    table = <rect x={14} y={30} width={92} height={32} rx={4} className="tv-table" />;
    const top = Math.ceil(shown / 2);
    const bottom = shown - top;
    const place = (n: number, y: number) => {
      for (let i = 0; i < n; i++) seats.push({ x: 14 + (92 * (i + 0.5)) / n, y });
    };
    place(top, 20);
    place(bottom, 72);
  }
  return (
    <svg className="table-visual" viewBox="0 0 120 92" aria-hidden="true" focusable="false">
      {table}
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={r} className={i < filled ? "tv-seat taken" : "tv-seat"} />
      ))}
      {used > capacity && (
        <text x="60" y="50" textAnchor="middle" className="tv-over">
          +{used - capacity}
        </text>
      )}
    </svg>
  );
}
