import { useState } from "react";
import { ApiError, errorMessage } from "../../api/client";
import type { Member, Role } from "../../api/types";
import { useSession } from "../../auth/session";
import { ROLE_LABELS, RoleBadge } from "../../components/Badge";
import { Button, IconButton } from "../../components/Button";
import { useConfirm } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/EmptyState";
import { SelectField, TextField } from "../../components/fields";
import { Callout, PageHeader } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { initials } from "../../lib/format";
import { useAddMember, useMembers, useRemoveMember, useRenameTenant, useUpdateMember } from "./api";
import { CreateAccountForm } from "./CreateAccountForm";
import "./account.css";

const ROLE_HELP: Record<Role, string> = {
  owner: "Full control, including members and the account itself.",
  admin: "Manages members and everything in the account.",
  editor: "Edits weddings, guests, invitations and seating.",
  viewer: "Can look at everything but change nothing.",
};

export default function AccountPage() {
  const { currentTenant, user, isAdmin } = useSession();

  return (
    <div className="content-narrow stack-lg">
      <PageHeader
        eyebrow="Account settings"
        title={currentTenant?.name ?? "Your account"}
        subtitle="The people who can work on this account's weddings, and what they can do."
      />

      {currentTenant && <AccountNameCard key={currentTenant.id} name={currentTenant.name} canRename={isAdmin} />}
      {currentTenant && <MembersCard currentUserId={user?.id ?? ""} isAdmin={isAdmin} />}

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

      {user && (
        <section className="card card-pad row">
          <span className="avatar">{initials(user.full_name)}</span>
          <div>
            <strong>{user.full_name}</strong>
            <div className="small muted">Signed in as {user.email}</div>
          </div>
        </section>
      )}
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
        {isAdmin && <AddMemberForm />}
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

function AddMemberForm() {
  const add = useAddMember();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [needsDetails, setNeedsDetails] = useState(false);
  const fieldErrors = add.error instanceof ApiError ? add.error.fieldErrors : {};

  const reset = () => {
    setEmail("");
    setRole("editor");
    setFullName("");
    setPassword("");
    setNeedsDetails(false);
    add.reset();
  };

  return (
    <form
      className="add-member"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(
          {
            email: email.trim(),
            role,
            full_name: needsDetails ? fullName.trim() || null : null,
            password: needsDetails ? password || null : null,
          },
          {
            onSuccess: (m) => {
              toast.success(`${m.full_name} can now sign in to this account.`);
              reset();
            },
            onError: (err) => {
              // New people need a name and an initial password.
              if (err instanceof ApiError && err.code === "new_user_details_required") setNeedsDetails(true);
            },
          },
        );
      }}
    >
      <h3>Add a member</h3>
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
        {needsDetails && (
          <>
            <div className="span-2">
              <Callout tone="info">
                {email || "This person"} doesn't have a login yet. Choose their name and a first password, and share
                it with them privately.
              </Callout>
            </div>
            <TextField
              label="Their name"
              required
              maxLength={200}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={fieldErrors.full_name}
            />
            <TextField
              label="Initial password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              hint="At least 8 characters."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={fieldErrors.password}
            />
          </>
        )}
      </div>
      {add.isError && !(add.error instanceof ApiError && add.error.code === "new_user_details_required") && (
        <p className="inline-error">{errorMessage(add.error)}</p>
      )}
      <div className="form-actions">
        {needsDetails && (
          <Button variant="ghost" onClick={reset}>
            Cancel
          </Button>
        )}
        <Button type="submit" icon="plus" variant="primary" loading={add.isPending}>
          Add member
        </Button>
      </div>
    </form>
  );
}
