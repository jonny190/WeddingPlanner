import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../../auth/session";
import { Button } from "../../components/Button";
import { TextField } from "../../components/fields";
import { useToast } from "../../components/Toasts";
import { useCreateTenant } from "./api";

/** Create another account (tenant) and switch to it. */
export function CreateAccountForm({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState("");
  const create = useCreateTenant();
  const { switchTenant } = useSession();
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <form
      className={compact ? "row" : "stack-sm"}
      style={compact ? { alignItems: "flex-end" } : undefined}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        create.mutate(name.trim(), {
          onSuccess: (tenant) => {
            toast.success(`Created "${tenant.name}". You're now working in it.`);
            setName("");
            switchTenant(tenant.id);
            navigate("/");
          },
          onError: (err) => toast.error(err),
        });
      }}
    >
      <TextField
        label="New account name"
        required
        placeholder="e.g. Rosewood Weddings"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={compact ? "grow" : undefined}
      />
      <Button type="submit" variant={compact ? "secondary" : "primary"} loading={create.isPending} icon="plus">
        Create account
      </Button>
    </form>
  );
}
