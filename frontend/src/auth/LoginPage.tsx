import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { errorMessage } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/fields";
import { Callout } from "../components/misc";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";

export default function LoginPage() {
  const { login } = useSession();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      // <GuestOnly> redirects once the session is set.
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to plan the big day."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" state={location.state}>
            Create an account
          </Link>
        </>
      }
    >
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
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Sign in
        </Button>
        <p className="small auth-aside-link">
          <Link to="/forgot-password">Forgotten your password?</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
