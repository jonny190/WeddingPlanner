import { useState } from "react";
import type { SeatingPlan, TableShape } from "../../api/types";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { Checkbox, SelectField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { useToast } from "../../components/Toasts";
import { pluralize } from "../../lib/format";
import { useBulkCreateTables, useCreateTable } from "./api";

export const SHAPE_LABELS: Record<TableShape, string> = { round: "Round", rectangle: "Rectangular" };

interface Props {
  weddingId: string;
  eventId: string;
  eventName: string;
  plan: SeatingPlan;
}

/** Create the room layout: many identical tables at once, or one at a time. */
export function RoomSetup({ weddingId, eventId, eventName, plan }: Props) {
  const bulk = useBulkCreateTables(weddingId, eventId);
  const single = useCreateTable(weddingId, eventId);
  const confirm = useConfirm();
  const toast = useToast();
  const hasTables = plan.tables.length > 0;

  const [count, setCount] = useState("10");
  const [seats, setSeats] = useState("8");
  const [shape, setShape] = useState<TableShape>("round");
  const [prefix, setPrefix] = useState("Table");
  const [replace, setReplace] = useState(false);

  const [tableName, setTableName] = useState("");
  const [tableSeats, setTableSeats] = useState("10");
  const [tableShape, setTableShape] = useState<TableShape>("rectangle");

  const n = Number(count);
  const m = Number(seats);
  const validBulk = Number.isInteger(n) && n >= 1 && n <= 200 && Number.isInteger(m) && m >= 1 && m <= 100;
  const startNumber = replace || !hasTables ? 1 : nextNumber(plan, prefix.trim() || "Table");

  const createBulk = async () => {
    if (!validBulk) return;
    if (replace && hasTables) {
      const ok = await confirm({
        title: "Replace the current layout?",
        message: `This deletes all ${pluralize(plan.tables.length, "table")} at ${eventName} and everyone's seat assignments.`,
        confirmLabel: "Replace layout",
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      const created = await bulk.mutateAsync({
        count: n,
        capacity: m,
        shape,
        name_prefix: prefix.trim() || "Table",
        start_number: startNumber,
        replace_existing: replace,
      });
      toast.success(`${pluralize(created.length, "table")} added (${n * m} seats).`);
      setReplace(false);
    } catch (err) {
      toast.error(err);
    }
  };

  const createSingle = async () => {
    const capacity = Number(tableSeats);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return;
    try {
      const t = await single.mutateAsync({ name: tableName.trim() || null, capacity, shape: tableShape });
      toast.success(`${t.name} added.`);
      setTableName("");
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="room-setup">
      <form
        className="setup-block"
        onSubmit={(e) => {
          e.preventDefault();
          void createBulk();
        }}
      >
        <h3>Add several tables</h3>
        <div className="setup-row">
          <TextField
            label="Tables"
            type="number"
            min={1}
            max={200}
            required
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="w-num"
          />
          <span className="setup-times" aria-hidden="true">
            ×
          </span>
          <TextField
            label="Seats each"
            type="number"
            min={1}
            max={100}
            required
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="w-num"
          />
          <SelectField label="Shape" value={shape} onChange={(e) => setShape(e.target.value as TableShape)}>
            <option value="round">Round</option>
            <option value="rectangle">Rectangular</option>
          </SelectField>
          <TextField
            label="Name prefix"
            maxLength={80}
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="w-prefix"
          />
        </div>
        <div className="row-between">
          <Checkbox
            label="Replace the existing tables"
            hint={hasTables ? "Removes the current layout and all seat assignments first." : undefined}
            checked={replace}
            disabled={!hasTables}
            onChange={(e) => setReplace(e.target.checked)}
          />
          <Button type="submit" variant="primary" icon="plus" loading={bulk.isPending} disabled={!validBulk}>
            {validBulk ? `Create ${n} × ${m}-seat tables` : "Create tables"}
          </Button>
        </div>
        {validBulk && (
          <p className="tiny muted" style={{ margin: 0 }}>
            Named {prefix.trim() || "Table"} {startNumber} to {prefix.trim() || "Table"} {startNumber + n - 1}.
          </p>
        )}
        {replace && hasTables && (
          <Callout tone="warning">Everyone currently seated at {eventName} will be unassigned.</Callout>
        )}
      </form>

      <form
        className="setup-block"
        onSubmit={(e) => {
          e.preventDefault();
          void createSingle();
        }}
      >
        <h3>Add one table</h3>
        <div className="setup-row">
          <TextField
            label="Name"
            optional
            maxLength={100}
            placeholder="e.g. Top table"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="w-prefix"
          />
          <TextField
            label="Seats"
            type="number"
            min={1}
            max={100}
            required
            value={tableSeats}
            onChange={(e) => setTableSeats(e.target.value)}
            className="w-num"
          />
          <SelectField label="Shape" value={tableShape} onChange={(e) => setTableShape(e.target.value as TableShape)}>
            <option value="round">Round</option>
            <option value="rectangle">Rectangular</option>
          </SelectField>
          <Button type="submit" icon="plus" loading={single.isPending} className="setup-submit">
            Add table
          </Button>
        </div>
      </form>
    </div>
  );
}

/** The next free number for "<prefix> N" table names. */
function nextNumber(plan: SeatingPlan, prefix: string): number {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const t of plan.tables) {
    const m = re.exec(t.name.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
