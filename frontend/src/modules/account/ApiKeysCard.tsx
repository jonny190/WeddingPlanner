import { useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { ApiKey, ApiKeyCreated } from "../../api/types";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/EmptyState";
import { Checkbox, SelectField, TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { formatDate, formatRelative, parseDate } from "../../lib/format";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "./api";

const EXPIRY_OPTIONS = [
  { value: "", label: "Never" },
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In a year" },
];

export function ApiKeysCard({
  currentUserId,
  isAdmin,
  canEdit,
}: {
  currentUserId: string;
  isAdmin: boolean;
  canEdit: boolean;
}) {
  const keys = useApiKeys();
  const revoke = useRevokeApiKey();
  const confirm = useConfirm();
  const toast = useToast();
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  const remove = async (k: ApiKey) => {
    const ok = await confirm({
      title: `Revoke "${k.name}"?`,
      message: "Anything using this key stops working straight away. This cannot be undone.",
      confirmLabel: "Revoke key",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(k.id);
      if (created?.id === k.id) setCreated(null);
      toast.success(`Key "${k.name}" revoked.`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">API keys</h2>
          <div className="small muted">
            For software that works in this account on your behalf, such as an AI agent. A key can never do more
            than you can, and you choose whether it may make changes or send email.
          </div>
        </div>
      </header>
      <div className="card-body stack">
        {created && <NewKeyReveal created={created} onDismiss={() => setCreated(null)} />}
        {keys.isPending ? (
          <PageLoader label="Loading keys…" />
        ) : keys.isError ? (
          <ErrorState compact error={keys.error} onRetry={() => void keys.refetch()} />
        ) : keys.data.length === 0 ? (
          <p className="small muted">No keys yet.</p>
        ) : (
          <ul className="list-plain member-list">
            {keys.data.map((k) => (
              <li key={k.id} className="member-row api-key-row">
                <div className="member-main">
                  <strong>
                    {k.name} <code>{k.prefix}…</code>
                  </strong>
                  <span className="small muted">
                    {isAdmin && k.user_id !== currentUserId ? `${k.user_name}'s key, ` : ""}
                    created {formatDate(parseDate(k.created_at))}
                    {k.expires_at ? `, expires ${formatDate(parseDate(k.expires_at))}` : ""}
                    {k.last_used_at ? `, last used ${formatRelative(k.last_used_at)}` : ", never used"}
                  </span>
                </div>
                <KeyScopes k={k} />
                <IconButton icon="trash" tone="danger" label={`Revoke the key ${k.name}`} onClick={() => void remove(k)} />
              </li>
            ))}
          </ul>
        )}
        <CreateKeyForm canEdit={canEdit} onCreated={setCreated} />
      </div>
    </section>
  );
}

function KeyScopes({ k }: { k: ApiKey }) {
  return (
    <span className="key-scopes">
      <span className="tag">{k.can_write ? "Can make changes" : "Read only"}</span>
      {k.can_send && <span className="tag">Can send email</span>}
    </span>
  );
}

function CreateKeyForm({ canEdit, onCreated }: { canEdit: boolean; onCreated: (k: ApiKeyCreated) => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [canSend, setCanSend] = useState(false);
  const [expires, setExpires] = useState("");
  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  return (
    <form
      className="create-key"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          {
            name: name.trim(),
            can_write: canWrite,
            can_send: canWrite && canSend,
            expires_in_days: expires ? Number(expires) : null,
          },
          {
            onSuccess: (made) => {
              onCreated(made);
              setName("");
              setCanWrite(false);
              setCanSend(false);
              setExpires("");
              create.reset();
            },
          },
        );
      }}
    >
      <h3>Create a key</h3>
      <p className="small muted">
        Give it a name you will recognise, such as the agent it is for. You see the key once, when it is made.
      </p>
      <div className="form-grid">
        <TextField
          label="Key name"
          required
          maxLength={100}
          placeholder="e.g. Hermes on my laptop"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
        />
        <SelectField label="Expires" value={expires} onChange={(e) => setExpires(e.target.value)}>
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectField>
      </div>
      <Checkbox
        label="Can make changes"
        hint={
          canEdit
            ? "Add and edit guests, seating, menus and drafts. Without this the key only reads."
            : "Your role can only view this account, so its keys can only read."
        }
        checked={canWrite}
        disabled={!canEdit}
        onChange={(e) => {
          setCanWrite(e.target.checked);
          if (!e.target.checked) setCanSend(false);
        }}
      />
      <Checkbox
        label="Can send email"
        hint="Send invitations and reminders to guests, test emails, and member invitations."
        checked={canWrite && canSend}
        disabled={!canWrite}
        onChange={(e) => setCanSend(e.target.checked)}
      />
      {create.isError && <p className="inline-error">{errorMessage(create.error)}</p>}
      <div className="form-actions">
        <Button type="submit" icon="lock" variant="primary" loading={create.isPending}>
          Create key
        </Button>
      </div>
    </form>
  );
}

function NewKeyReveal({ created, onDismiss }: { created: ApiKeyCreated; onDismiss: () => void }) {
  const toast = useToast();
  const mcpUrl = `${window.location.origin}/api/mcp`;
  const snippet = [
    "mcp_servers:",
    "  wedding_planner:",
    `    url: "${mcpUrl}"`,
    "    headers:",
    '      Authorization: "Bearer ${WEDDING_PLANNER_API_KEY}"',
  ].join("\n");

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied.`);
    } catch {
      toast.error("Copying failed. Select the text and copy it by hand.");
    }
  };

  return (
    <Callout tone="success" icon="lock" className="key-reveal">
      <strong>Copy your new key now. It will not be shown again.</strong>
      <div className="key-secret">
        <code data-testid="api-key-secret">{created.key}</code>
        <Button size="sm" icon="copy" onClick={() => void copy(created.key, "Key")}>
          Copy key
        </Button>
      </div>
      <details>
        <summary className="small">Connect Hermes</summary>
        <p className="small muted">
          Put the key in <code>~/.hermes/.env</code> as <code>WEDDING_PLANNER_API_KEY=…</code>, add this to{" "}
          <code>~/.hermes/config.yaml</code>, then run <code>/reload-mcp</code>. Other MCP clients need the same
          URL and header.
        </p>
        <pre className="key-snippet">
          {snippet}
          <span className="key-snippet-copy">
            <IconButton icon="copy" label="Copy the Hermes configuration" onClick={() => void copy(snippet, "Configuration")} />
          </span>
        </pre>
      </details>
      <div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Done, I have saved it
        </Button>
      </div>
    </Callout>
  );
}
