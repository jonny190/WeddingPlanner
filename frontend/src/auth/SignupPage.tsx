import { useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiError, errorMessage } from "../api/client";
import { Button } from "../components/Button";
import { TextField } from "../components/fields";
import { Callout } from "../components/misc";
import { AuthLayout } from "./AuthLayout";
import { useSession } from "./session";

export default function SignupPage() {
  const { signup } = useSession();
  const location = useLocation();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", account_name: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (form.password.length < 8) {
      setFieldErrors({ password: "Use at least 8 characters." });
      return;
    }
    setBusy(true);
    try {
      await signup({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        account_name: form.account_name.trim(),
      });
    } catch (err) {
      if (err instanceof ApiError) setFieldErrors(err.fieldErrors);
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free to start. Bring your guest list, we'll handle the rest."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        {error && <Callout tone="danger">{error}</Callout>}
        <TextField
          label="Your name"
          autoComplete="name"
          required
          autoFocus
          value={form.full_name}
          onChange={set("full_name")}
          error={fieldErrors.full_name}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
          error={fieldErrors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={form.password}
          onChange={set("password")}
          error={fieldErrors.password}
        />
        <TextField
          label="Account name"
          required
          placeholder="e.g. Alex & Sam, or Rosewood Weddings"
          hint="The couple's names, or your business name if you plan weddings for clients."
          value={form.account_name}
          onChange={set("account_name")}
          error={fieldErrors.account_name}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
