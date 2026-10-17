import { useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { Invite, Member, Role } from "../../api/types";
import { useSession } from "../../auth/session";
import { ROLE_LABELS, RoleBadge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/EmptyState";
import { SelectField, TextField } from "../../components/fields";
import { PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { formatDate, initials, parseDate } from "../../lib/format";
import {
  useChangePassword,
  useInviteMember,
  useInvites,
  useMembers,
  useRemoveMember,
  useRenameTenant,
  useRevokeInvite,
  useUpdateMember,
} from "./api";
import { ApiKeysCard } from "./ApiKeysCard";
import { CreateAccountForm } from "./CreateAccountForm";
import "./account.css";

const ROLE_HELP: Record<Role, string> = {
  owner: "Full control, including members and the account itself.",
  admin: "Manages members and everything in the account.",
  editor: "Edits weddings, guests, invitations and seating.",
  viewer: "Can look at everything but change nothing.",
};

export default function AccountPage() {
  const { currentTenant, user, isAdmin, canEdit } = useSession();

  return (
    <div className="content-narrow stack-lg">
      <PageHeader
        eyebrow="Account settings"
        title={currentTenant?.name ?? "Your account"}
        subtitle="The people who can work on this account's weddings, and what they can do."
      />

      {currentTenant && <AccountNameCard key={currentTenant.id} name={currentTenant.name} canRename={isAdmin} />}
      {currentTenant && <MembersCard currentUserId={user?.id ?? ""} isAdmin={isAdmin} />}
      {currentTenant && (
        <ApiKeysCard key={`keys-${currentTenant.id}`} currentUserId={user?.id ?? ""} isAdmin={isAdmin} canEdit={canEdit} />
      )}

      <section className="card">
        <header className="card-header">
          <div>
            <h2 className="section-title">Another account</h2>
            <div className="small muted">
              Planners often keep one account per client. Switch between accounts from the menu at the top.
            </div>
          </div>
        </header>
        <div className="card-body">
          <CreateAccountForm compact />
        </div>
      </section>

      {user && <LoginCard fullName={user.full_name} email={user.email} />}
    </div>
  );
}

function AccountNameCard({ name, canRename }: { name: string; canRename: boolean }) {
  const [value, setValue] = useState(name);
  const rename = useRenameTenant();
  const toast = useToast();
  return (
    <section className="card">
      <header className="card-header">
        <h2 className="section-title">Account name</h2>
      </header>
      <form
        className="card-body row"
        style={{ alignItems: "flex-end" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim() || value.trim() === name) return;
          rename.mutate(value.trim(), {
            onSuccess: () => toast.success("Account renamed."),
            onError: (err) => toast.error(err),
          });
        }}
      >
        <TextField
          label="Name"
          required
          maxLength={200}
          value={value}
          disabled={!canRename}
          hint={canRename ? undefined : "Only owners and admins can rename the account."}
          onChange={(e) => setValue(e.target.value)}
          className="grow"
        />
        {canRename && (
          <Button type="submit" variant="primary" loading={rename.isPending} disabled={!value.trim() || value.trim() === name}>
            Save
          </Button>
        )}
      </form>
    </section>
  );
}

function MembersCard({ currentUserId, isAdmin }: { currentUserId: string; isAdmin: boolean }) {
  const { refresh } = useSession();
  const members = useMembers();
  const updateMember = useUpdateMember();
  const removeMember = useRemoveMember();
  const confirm = useConfirm();
  const toast = useToast();

  const changeRole = async (m: Member, role: Role) => {
    try {
      await updateMember.mutateAsync({ id: m.id, role });
      toast.success(`${m.full_name}'s role is now ${ROLE_LABELS[role]}.`);
      // Your own role decides what the app lets you do.
      if (m.user_id === currentUserId) await refresh();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (m: Member) => {
    const self = m.user_id === currentUserId;
    const ok = await confirm({
      title: self ? "Leave this account?" : `Remove ${m.full_name}?`,
      message: self
        ? "You'll lose access to its weddings straight away."
        : `${m.full_name} will lose access to this account's weddings. Their own login is not deleted.`,
      confirmLabel: self ? "Leave account" : "Remove member",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await removeMember.mutateAsync(m.id);
      toast.success(self ? "You left the account." : `${m.full_name} removed.`);
      if (self) window.location.assign("/");
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Members</h2>
          <div className="small muted">Everyone who can sign in to this account.</div>
        </div>
      </header>
      <div className="card-body stack">
        {members.isPending ? (
          <PageLoader label="Loading members…" />
        ) : members.isError ? (
          <ErrorState compact error={members.error} onRetry={() => void members.refetch()} />
        ) : (
          <ul className="list-plain member-list">
            {members.data.map((m) => (
              <li key={m.id} className="member-row">
                <span className="avatar">{initials(m.full_name || m.email)}</span>
                <div className="member-main">
                  <strong>
                    {m.full_name}
                    {m.user_id === currentUserId && <span className="muted small"> (you)</span>}
                  </strong>
                  <span className="small muted">{m.email}</span>
                </div>
                {isAdmin ? (
                  <select
                    className="select select-sm member-role"
                    aria-label={`Role for ${m.full_name}`}
                    value={m.role}
                    disabled={updateMember.isPending}
                    onChange={(e) => void changeRole(m, e.target.value as Role)}
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <RoleBadge role={m.role} />
                )}
                {isAdmin && (
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`Remove ${m.full_name}`}
                    onClick={() => void remove(m)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <PendingInvites />}
        {isAdmin && <InviteMemberForm />}
        <details className="role-help">
          <summary className="small">What can each role do?</summary>
          <dl>
            {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
              <div key={r}>
                <dt>{ROLE_LABELS[r]}</dt>
                <dd>{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}

function PendingInvites() {
  const invites = useInvites();
  const revoke = useRevokeInvite();
  const toast = useToast();
  if (!invites.data || invites.data.length === 0) return null;

  const cancel = async (invite: Invite) => {
    try {
      await revoke.mutateAsync(invite.id);
      toast.success(`Invitation to ${invite.email} withdrawn.`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="stack-sm">
      <h3 className="section-subtitle">Invited, not yet joined</h3>
      <ul className="list-plain member-list">
        {invites.data.map((invite) => (
          <li key={invite.id} className="member-row">
            <span className="avatar avatar-muted">{initials(invite.email)}</span>
            <div className="member-main">
              <strong>{invite.email}</strong>
              <span className="small muted">
                Invited{invite.invited_by_name ? ` by ${invite.invited_by_name}` : ""}, link valid until{" "}
                {formatDate(parseDate(invite.expires_at))}
              </span>
            </div>
            <RoleBadge role={invite.role} />
            <IconButton
              icon="trash"
              tone="danger"
              label={`Withdraw the invitation to ${invite.email}`}
              onClick={() => void cancel(invite)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteMemberForm() {
  const invite = useInviteMember();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const fieldErrors = invite.error instanceof ApiError ? invite.error.fieldErrors : {};

  return (
    <form
      className="add-member"
      onSubmit={(e) => {
        e.preventDefault();
        invite.mutate(
          { email: email.trim(), role },
          {
            onSuccess: (sent) => {
              toast.success(`Invitation emailed to ${sent.email}.`);
              setEmail("");
              setRole("editor");
              invite.reset();
            },
          },
        );
      }}
    >
      <h3>Invite someone</h3>
      <p className="small muted">
        They get an email with a link. Nothing changes until they open it and accept, and the link stops working
        after a week.
      </p>
      <div className="form-grid">
        <TextField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <SelectField label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)} hint={ROLE_HELP[role]}>
          {(["admin", "editor", "viewer", "owner"] as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </SelectField>
      </div>
      {invite.isError && <p className="inline-error">{errorMessage(invite.error)}</p>}
      <div className="form-actions">
        <Button type="submit" icon="mail" variant="primary" loading={invite.isPending}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}

function LoginCard({ fullName, email }: { fullName: string; email: string }) {
  const change = useChangePassword();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const fieldErrors = change.error instanceof ApiError ? change.error.fieldErrors : {};
  const wrongCurrent = change.error instanceof ApiError && change.error.code === "wrong_password";

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Your login</h2>
          <div className="small muted">Your login is the same across every account you belong to.</div>
        </div>
      </header>
      <div className="card-body stack">
        <div className="row">
          <span className="avatar">{initials(fullName)}</span>
          <div>
            <strong>{fullName}</strong>
            <div className="small muted">Signed in as {email}</div>
          </div>
        </div>
        <form
          className="stack-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== confirm) {
              setMismatch(true);
              return;
            }
            setMismatch(false);
            change.mutate(
              { current_password: current, new_password: next },
              {
                onSuccess: () => {
                  toast.success("Password changed.");
                  setCurrent("");
                  setNext("");
                  setConfirm("");
                  change.reset();
                },
              },
            );
          }}
        >
          <h3 className="section-subtitle">Change password</h3>
          <div className="form-grid">
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              error={wrongCurrent ? "That is not your current password." : fieldErrors.current_password}
            />
            <div />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              hint="At least 8 characters."
              value={next}
              onChange={(e) => setNext(e.target.value)}
              error={fieldErrors.new_password}
            />
            <TextField
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={mismatch ? "The two passwords do not match." : undefined}
            />
          </div>
          {change.isError && !wrongCurrent && <p className="inline-error">{errorMessage(change.error)}</p>}
          <div className="form-actions">
            <Button type="submit" variant="secondary" loading={change.isPending}>
              Change password
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
