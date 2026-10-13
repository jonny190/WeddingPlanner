import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, errorMessage, publicApi } from "../api/client";
import type { SessionResponse } from "../api/types";
import { Button } from "../components/Button";
import { TextField } from "../components/fields";
import { Callout } from "../components/misc";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";

/** /reset-password/:token: choose a new password with the link from the email. */
export default function ResetPasswordPage() {
  const { token = "" } = useParams();
  const { startSession } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await publicApi.post<SessionResponse>("/auth/reset-password", { token, new_password: password });
      // <GuestOnly> sends the signed-in user on to the app.
      startSession(res);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_reset_token") setExpired(true);
      else setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (expired) {
    return (
      <AuthLayout title="This link has expired" subtitle="Reset links work for an hour, and only once.">
        <Callout tone="warning">Ask for a fresh link and use it straight away.</Callout>
        <p style={{ marginTop: 16 }}>
          <Link to="/forgot-password">Send me a new link</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed in as soon as it's saved.">
      <form onSubmit={onSubmit}>
        {error && <Callout tone="danger">{error}</Callout>}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          hint="At least 8 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <TextField
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Save and sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
