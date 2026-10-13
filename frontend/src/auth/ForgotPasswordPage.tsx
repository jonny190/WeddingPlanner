import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage, publicApi } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/fields";
import { Callout } from "../components/misc";
import { AuthLayout } from "./AuthLayout";

/** /forgot-password: ask for a reset link by email. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await publicApi.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Forgotten your password?"
      subtitle="Tell us your email and we'll send you a link to choose a new one."
      footer={
        <>
          Remembered it? <Link to="/login">Sign in</Link>
        </>
      }
    >
      {sent ? (
        <Callout tone="success">
          If {email.trim()} has a login, a reset link is on its way. It works for an hour. Check your spam folder if it
          has not arrived in a few minutes.
        </Callout>
      ) : (
        <form onSubmit={onSubmit}>
          {error && <Callout tone="danger">{error}</Callout>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" size="lg" block loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
