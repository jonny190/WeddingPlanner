import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Draft, InvitationDesign, Wedding, WeddingEvent } from "../../api/types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { Dropdown } from "../../components/Dropdown";
import { ErrorState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Callout } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { TabPanel, Tabs } from "../../components/Tabs";
import { useToast } from "../../components/Toasts";
import { useGuardedAction, useUnsavedChanges } from "../../layout/NavigationGuard";
import { formatRelative, pluralize } from "../../lib/format";
import { deepEqual } from "../../lib/utils";
import { useGuests } from "../guests/api";
import { useDeleteDraft, useUpdateDraft } from "./api";
import { CardDesigner } from "./designer";
import { fallbackDesign, useDesignerResources, useSampleValues } from "./designerSupport";
import { EmailTab } from "./EmailTab";
import { PreviewTab } from "./PreviewTab";
import { isAudience, SendTab } from "./SendTab";

type EditorTab = "card" | "email" | "preview" | "send";
const TAB_IDS: EditorTab[] = ["card", "email", "preview", "send"];

interface Editable {
  name: string;
  subject: string;
  body: string;
  design: InvitationDesign;
}

function toEditable(draft: Draft): Editable {
  return { name: draft.name, subject: draft.subject, body: draft.body, design: draft.design ?? fallbackDesign() };
}

interface Props {
  wedding: Wedding;
  event: WeddingEvent;
  draft: Draft;
  drafts: Draft[];
  canEdit: boolean;
  onClose: () => void;
  onSwitch: (draftId: string) => void;
}

export function DraftEditor({ wedding, event, draft, drafts, canEdit, onClose, onSwitch }: Props) {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab: EditorTab = TAB_IDS.includes(requestedTab as EditorTab) ? (requestedTab as EditorTab) : "card";
  const audienceParam = params.get("audience");
  const initialAudience = isAudience(audienceParam) ? audienceParam : "unsent";

  const [saved, setSaved] = useState<Editable>(() => toEditable(draft));
  const [current, setCurrent] = useState<Editable>(saved);
  const dirty = canEdit && !deepEqual(current, saved);
  useUnsavedChanges(dirty, `Your changes to “${saved.name}” haven't been saved.`);

  const update = useUpdateDraft(wedding.id, event.id);
  const remove = useDeleteDraft(wedding.id, event.id);
  const resources = useDesignerResources(wedding.id);
  const sampleValues = useSampleValues(wedding, event);
  const guestsQuery = useGuests(wedding.id);
  const invitedGuests = useMemo(
    () => (guestsQuery.data ?? []).filter((g) => g.invitations.some((i) => i.event_id === event.id)),
    [guestsQuery.data, event.id],
  );
  const [previewGuest, setPreviewGuest] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const guarded = useGuardedAction();

  const problems = [
    !current.name.trim() && "a draft name",
    !current.subject.trim() && "a subject",
    !current.body.trim() && "a message",
  ].filter(Boolean) as string[];

  const save = async () => {
    if (!dirty || update.isPending) return;
    if (problems.length) {
      toast.error(`Please add ${problems.join(" and ")} before saving.`);
      return;
    }
    const snapshot = current;
    try {
      const result = await update.mutateAsync({
        id: draft.id,
        data: {
          name: snapshot.name.trim(),
          subject: snapshot.subject,
          body: snapshot.body,
          design: snapshot.design,
        },
      });
      const next = toEditable(result);
      setSaved(next);
      // Adopt the server's copy unless the user kept typing while we saved.
      setCurrent((c) => (c === snapshot ? next : c));
      toast.success("Draft saved.");
    } catch (err) {
      toast.error(err);
    }
  };

  // Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setTab = (next: EditorTab) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${draft.name}”?`,
      message: "The draft and its card design will be deleted. Emails already sent are not affected.",
      confirmLabel: "Delete draft",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(draft.id);
      toast.success("Draft deleted.");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  };

  const setDesign = (design: InvitationDesign) => setCurrent((c) => ({ ...c, design }));
  const needsResources = tab === "card" || tab === "email";

  return (
    <div className="draft-editor stack">
      <div className="editor-head card">
        <div className="editor-head-main">
          <button type="button" className="link-btn small editor-back" onClick={() => void guarded(onClose)}>
            <Icon name="chevronLeft" size={14} /> All drafts for {event.name}
          </button>
          <div className="editor-title-row">
            <label className="sr-only" htmlFor="draft-name">
              Draft name
            </label>
            <input
              id="draft-name"
              className="editor-name"
              value={current.name}
              maxLength={120}
              readOnly={!canEdit}
              onChange={(e) => setCurrent((c) => ({ ...c, name: e.target.value }))}
            />
            <Badge tone={draft.status === "sent" ? "success" : "neutral"} dot>
              {draft.status === "sent" ? "Sent" : "Draft"}
            </Badge>
          </div>
          <div className="tiny muted">
            {draft.sent_count > 0
              ? `Sent to ${pluralize(draft.sent_count, "guest")}, last ${formatRelative(draft.last_sent_at)}`
              : "Not sent yet"}
          </div>
        </div>
        <div className="editor-head-actions">
          {drafts.length > 1 && (
            <select
              className="select select-sm draft-switch"
              aria-label="Switch draft"
              value={draft.id}
              onChange={(e) => {
                const id = e.target.value;
                void guarded(() => onSwitch(id));
              }}
            >
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {canEdit && (
            <>
              <span className={dirty ? "save-state dirty" : "save-state"} aria-live="polite">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
              {dirty && (
                <Button variant="ghost" size="sm" onClick={() => setCurrent(saved)} disabled={update.isPending}>
                  Discard
                </Button>
              )}
              <Button variant="primary" icon="check" onClick={() => void save()} disabled={!dirty} loading={update.isPending}>
                Save
              </Button>
              <Dropdown
                label="More draft actions"
                triggerClassName="icon-btn"
                trigger={<Icon name="settings" />}
              >
                {() => (
                  <button type="button" role="menuitem" className="menu-item danger" onClick={() => void onDelete()}>
                    <Icon name="trash" /> Delete draft
                  </button>
                )}
              </Dropdown>
            </>
          )}
        </div>
      </div>

      {!canEdit && <Callout tone="info">You have view-only access, so this draft can't be changed or sent.</Callout>}

      <Tabs<EditorTab>
        label="Draft sections"
        idPrefix="draft-tab"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "card", label: "Card" },
          { id: "email", label: "Email" },
          { id: "preview", label: "Preview" },
          { id: "send", label: "Send" },
        ]}
      />

      <TabPanel idPrefix="draft-tab" activeId={tab}>
        {needsResources && resources.isLoading ? (
          <PageLoader label="Loading fonts…" />
        ) : needsResources && resources.error ? (
          <ErrorState error={resources.error} />
        ) : tab === "card" ? (
          <div className="card-designer-host">
            <CardDesigner
              design={current.design}
              onChange={setDesign}
              fonts={resources.fonts}
              placeholders={resources.placeholders}
              sampleValues={sampleValues}
              assets={resources.assets}
              onUploadImage={resources.onUploadImage}
              assetUrl={resources.assetUrl}
              readOnly={!canEdit}
            />
          </div>
        ) : tab === "email" ? (
          <EmailTab
            subject={current.subject}
            body={current.body}
            onSubject={(subject) => setCurrent((c) => ({ ...c, subject }))}
            onBody={(body) => setCurrent((c) => ({ ...c, body }))}
            emailStyle={current.design.email}
            onEmailStyle={(email) => setCurrent((c) => ({ ...c, design: { ...c.design, email } }))}
            placeholders={resources.placeholders}
            fonts={resources.fonts}
            assets={resources.assets}
            onUploadImage={resources.onUploadImage}
            assetUrl={resources.assetUrl}
            readOnly={!canEdit}
          />
        ) : tab === "preview" ? (
          <PreviewTab
            weddingId={wedding.id}
            eventId={event.id}
            draftId={draft.id}
            subject={current.subject}
            body={current.body}
            design={current.design}
            guests={invitedGuests}
            guestId={previewGuest}
            onGuestId={setPreviewGuest}
          />
        ) : (
          <SendTab
            weddingId={wedding.id}
            event={event}
            draftId={draft.id}
            guests={invitedGuests}
            initialAudience={initialAudience}
            dirty={dirty}
            saving={update.isPending}
            onSave={() => void save()}
            canEdit={canEdit}
          />
        )}
      </TabPanel>
    </div>
  );
}
