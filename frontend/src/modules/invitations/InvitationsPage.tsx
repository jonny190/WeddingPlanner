import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Draft, Wedding, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { EmptyState, ErrorState } from "../../components/EmptyState";
import { EventTabs, useSelectedEvent } from "../../components/EventTabs";
import { Callout, PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { TabPanel } from "../../components/Tabs";
import { useGuardedAction } from "../../layout/NavigationGuard";
import { parseInstant } from "../../lib/format";
import { useEvents, useWedding } from "../weddings/WeddingContext";
import { useDrafts } from "./api";
import { DeliveryLog } from "./DeliveryLog";
import { DraftEditor } from "./DraftEditor";
import { DraftList } from "./DraftList";
import { NewDraftDialog } from "./NewDraftDialog";
import "./invitations.css";

export default function InvitationsPage() {
  const wedding = useWedding();
  const events = useEvents();
  const [event, selectEvent] = useSelectedEvent(events, ["draft", "tab", "audience"]);
  const guarded = useGuardedAction();

  return (
    <div className="stack">
      <PageHeader
        title="Invitations"
        subtitle="Design a card, write the email, preview it as any guest, then send it."
      />
      {!event ? (
        <div className="card">
          <EmptyState icon="calendar" title="No events yet">
            Add an event in Settings before creating invitations.
          </EmptyState>
        </div>
      ) : (
        <>
          <EventTabs
            events={events}
            value={event.id}
            onChange={(id) => void guarded(() => selectEvent(id))}
            label="Invitations for"
          />
          <TabPanel idPrefix="event-tab" activeId={event.id}>
            <EventInvitations key={event.id} wedding={wedding} event={event} events={events} />
          </TabPanel>
        </>
      )}
    </div>
  );
}

/** The draft to open for "send" links that don't name one: the last one sent, else the newest. */
function defaultDraft(drafts: Draft[]): Draft | null {
  if (drafts.length === 0) return null;
  const time = (d: Draft) => parseInstant(d.last_sent_at ?? d.updated_at)?.getTime() ?? 0;
  return [...drafts].sort((a, b) => time(b) - time(a))[0];
}

function EventInvitations({ wedding, event, events }: { wedding: Wedding; event: WeddingEvent; events: WeddingEvent[] }) {
  const { canEdit } = useSession();
  const drafts = useDrafts(wedding.id, event.id);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const draftId = params.get("draft");
  const tab = params.get("tab");

  const setDraftParam = (id: string | null, tabValue?: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("draft", id);
        else next.delete("draft");
        if (tabValue) next.set("tab", tabValue);
        else if (!id) {
          next.delete("tab");
          next.delete("audience");
        }
        return next;
      },
      { replace: !id },
    );

  // A link like ?tab=send&audience=opened_no_reply (from Replies) opens the most relevant draft.
  useEffect(() => {
    if (draftId || !tab || !drafts.data) return;
    const pick = defaultDraft(drafts.data);
    if (pick) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("draft", pick.id);
          return next;
        },
        { replace: true },
      );
    }
  }, [draftId, tab, drafts.data, setParams]);

  if (drafts.isPending) return <PageLoader label="Loading drafts…" />;
  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => void drafts.refetch()} />;

  const draft = draftId ? drafts.data.find((d) => d.id === draftId) : undefined;
  if (draft) {
    return (
      <DraftEditor
        key={draft.id}
        wedding={wedding}
        event={event}
        draft={draft}
        drafts={drafts.data}
        canEdit={canEdit}
        onClose={() => setDraftParam(null)}
        onSwitch={(id) => setDraftParam(id)}
      />
    );
  }

  return (
    <div className="stack-lg">
      {draftId && (
        <Callout tone="warning">That draft no longer exists. It may have been deleted.</Callout>
      )}
      {!draftId && tab === "send" && drafts.data.length === 0 && (
        <Callout tone="info">
          To send a reminder, first create an invitation draft for {event.name}. You can copy the wording and design
          from another event's draft.
        </Callout>
      )}
      <DraftList
        weddingId={wedding.id}
        eventId={event.id}
        eventName={event.name}
        drafts={drafts.data}
        canEdit={canEdit}
        onOpen={(d) => setDraftParam(d.id, "card")}
        onNew={() => setCreating(true)}
      />
      <DeliveryLog weddingId={wedding.id} eventId={event.id} />
      {creating && (
        <NewDraftDialog
          weddingId={wedding.id}
          event={event}
          events={events}
          onClose={() => setCreating(false)}
          onCreated={(d) => {
            setCreating(false);
            setDraftParam(d.id, "card");
          }}
        />
      )}
    </div>
  );
}
