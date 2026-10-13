import { useState } from "react";
import type { WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { EventTabs, useSelectedEvent } from "../../components/EventTabs";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { TabPanel } from "../../components/Tabs";
import { useToast } from "../../components/Toasts";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import { exportChoices, useMenu, useMenuChoices } from "./api";
import { MenuChoices } from "./MenuChoices";
import { MenuEditor } from "./MenuEditor";
import "./menus.css";

export default function MenusPage() {
  const wedding = useWedding();
  const events = useEvents();
  const [event, selectEvent] = useSelectedEvent(events);
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    if (!event) return;
    setExporting(true);
    try {
      await exportChoices(wedding.id, event.id);
    } catch (err) {
      toast.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Menus"
        subtitle="What is on the table at each event, and what every guest and their plus-one has chosen."
        actions={
          event && (
            <Button icon="download" onClick={() => void onExport()} loading={exporting}>
              Export for the caterer
            </Button>
          )
        }
      />
      {!event ? (
        <div className="card">
          <EmptyState icon="calendar" title="No events yet">
            Add an event in Settings before planning its menu.
          </EmptyState>
        </div>
      ) : (
        <>
          <EventTabs events={events} value={event.id} onChange={selectEvent} label="Menu for" />
          <TabPanel idPrefix="event-tab" activeId={event.id}>
            <EventMenu key={event.id} weddingId={wedding.id} event={event} />
          </TabPanel>
        </>
      )}
    </div>
  );
}

function EventMenu({ weddingId, event }: { weddingId: string; event: WeddingEvent }) {
  const menu = useMenu(weddingId, event.id);
  const choices = useMenuChoices(weddingId, event.id);

  if (menu.isPending) return <PageLoader label="Loading menu…" />;
  if (menu.isError) return <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />;

  return (
    <div className="stack">
      <MenuEditor weddingId={weddingId} eventId={event.id} eventName={event.name} menu={menu.data} />
      {choices.isPending ? (
        <PageLoader label="Loading choices…" />
      ) : choices.isError ? (
        <ErrorState compact error={choices.error} onRetry={() => void choices.refetch()} />
      ) : (
        <MenuChoices weddingId={weddingId} event={event} report={choices.data} />
      )}
    </div>
  );
}
