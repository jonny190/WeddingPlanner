import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, errorMessage, isApiError, publicApi, request } from "../api/client";
import { qk } from "../api/queryKeys";
import type { InvitePublic, SessionResponse } from "../api/types";
import { ROLE_LABELS } from "../components/Badge";
import { Button, ButtonLink } from "../components/Button";
import { TextField } from "../components/fields";
import { Callout } from "../components/misc";
import { PageLoader } from "../components/Spinner";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";

/**
 * /invite/:token: the page behind the link in an invitation email. Whoever opens it either
 * signs in (if the invited address already has a login) or creates one, then joins the account.
 */
export default function InvitePage() {
  const { token = "" } = useParams();
  const session = useSession();
  const invite = useQuery({
    queryKey: qk.invite(token),
    queryFn: () => publicApi.get<InvitePublic>(`/public/invites/${token}`),
    retry: false,
  });

  if (invite.isPending || session.status === "loading") {
    return (
      <AuthLayout title="Opening your invitation">
        <PageLoader />
      </AuthLayout>
    );
  }

  if (invite.isError) {
    const gone = isApiError(invite.error, 404);
    return (
      <AuthLayout
        title={gone ? "This invitation is no longer valid" : "Something went wrong"}
        subtitle={
          gone
            ? "Invitation links work for a week and only once. Ask the person who invited you to send a new one."
            : errorMessage(invite.error)
        }
        footer={<Link to="/login">Go to sign in</Link>}
      >
        <Callout tone={gone ? "warning" : "danger"}>
          {gone ? "Nothing has been changed on any account." : "Please try the link again in a moment."}
        </Callout>
      </AuthLayout>
    );
  }

  const details = invite.data;
  const who = details.invited_by_name ?? "Someone";
  const subtitle = `${who} has invited you to join ${details.account_name} as ${ROLE_LABELS[details.role].toLowerCase()}.`;

  if (session.status === "authenticated" && session.user) {
    if (session.user.email !== details.email) {
      return (
        <AuthLayout title="This invitation is for someone else" subtitle={subtitle}>
          <Callout tone="warning">
            It was sent to <strong>{details.email}</strong>, but you are signed in as {session.user.email}. Sign out,
            then open the link again with the right login.
          </Callout>
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" block onClick={session.logout}>
              Sign out
            </Button>
          </div>
        </AuthLayout>
      );
    }
    return <JoinAsCurrentUser token={token} details={details} subtitle={subtitle} />;
  }

  if (details.has_account) {
    return (
      <AuthLayout title={`Join ${details.account_name}`} subtitle={subtitle}>
        <Callout tone="info">
          You already have a login for <strong>{details.email}</strong>. Sign in and you will be brought straight
          back here to accept.
        </Callout>
        <div style={{ marginTop: 16 }}>
          <ButtonLink to="/login" state={{ from: `/invite/${token}` }} variant="primary" size="lg" block>
            Sign in to accept
          </ButtonLink>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>
          <Link to="/forgot-password">Forgotten your password?</Link>
        </p>
      </AuthLayout>
    );
  }

  return <CreateLoginAndJoin token={token} details={details} subtitle={subtitle} />;
}

function JoinAsCurrentUser({ token, details, subtitle }: { token: string; details: InvitePublic; subtitle: string }) {
  const { startSession } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request<SessionResponse>(`/public/invites/${token}/accept`, { method: "POST", body: {} });
      startSession(res, details.account_id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={`Join ${details.account_name}`} subtitle={subtitle}>
      {error && <Callout tone="danger">{error}</Callout>}
      <Button variant="primary" size="lg" block loading={busy} onClick={() => void accept()}>
        Accept and open the account
      </Button>
      <p className="small muted" style={{ marginTop: 12 }}>
        Your existing accounts are not affected.
      </p>
    </AuthLayout>
  );
}

function CreateLoginAndJoin({ token, details, subtitle }: { token: string; details: InvitePublic; subtitle: string }) {
  const { startSession } = useSession();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await publicApi.post<SessionResponse>(`/public/invites/${token}/accept`, {
        full_name: fullName.trim(),
        password,
      });
      startSession(res, details.account_id);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={`Join ${details.account_name}`}
      subtitle={subtitle}
      footer={
        <>
          Not you? Just close this page and nothing will change.
        </>
      }
    >
      <form onSubmit={onSubmit}>
        {error && <Callout tone="danger">{error}</Callout>}
        <TextField label="Email" type="email" value={details.email} readOnly hint="Your login will use this address." />
        <TextField
          label="Your name"
          autoComplete="name"
          required
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.full_name}
        />
        <TextField
          label="Choose a password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Create login and join
        </Button>
      </form>
    </AuthLayout>
  );
}
