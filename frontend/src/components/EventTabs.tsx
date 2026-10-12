import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { WeddingEvent } from "../api/types";
import { Tabs } from "./Tabs";

/** Default event: the "day" event if there is one, otherwise the first. */
export function defaultEvent(events: WeddingEvent[]): WeddingEvent | null {
  return events.find((e) => e.kind === "day") ?? events[0] ?? null;
}

/**
 * The event selected via the `?event=` query parameter (falling back to the default).
 * Switching events drops the listed per-event parameters (e.g. "draft").
 */
export function useSelectedEvent(
  events: WeddingEvent[],
  resetParams: string[] = [],
): [WeddingEvent | null, (eventId: string) => void] {
  const [params, setParams] = useSearchParams();
  const requested = params.get("event");
  const selected = events.find((e) => e.id === requested) ?? defaultEvent(events);

  const resetKey = resetParams.join(",");
  const select = useCallback(
    (eventId: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("event", eventId);
          resetKey.split(",").forEach((key) => key && next.delete(key));
          return next;
        },
        { replace: true },
      );
    },
    [setParams, resetKey],
  );

  return [selected, select];
}

interface EventTabsProps {
  events: WeddingEvent[];
  value: string | null;
  onChange: (eventId: string) => void;
  counts?: Record<string, number>;
  label?: string;
}

export function EventTabs({ events, value, onChange, counts, label = "Event" }: EventTabsProps) {
  if (events.length === 0 || !value) return null;
  return (
    <Tabs
      variant="pills"
      label={label}
      idPrefix="event-tab"
      value={value}
      onChange={onChange}
      tabs={events.map((e) => ({ id: e.id, label: e.name, count: counts?.[e.id] }))}
    />
  );
}
