import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, errorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { TextField } from "../../components/fields";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toasts";
import { orNull } from "../../lib/format";
import { useCreateWedding } from "./api";

export function NewWeddingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateWedding();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ partner_one_name: "", partner_two_name: "", wedding_date: "", contact_email: "" });
  const fieldErrors = create.error instanceof ApiError ? create.error.fieldErrors : {};

  const close = () => {
    if (create.isPending) return;
    create.reset();
    setForm({ partner_one_name: "", partner_two_name: "", wedding_date: "", contact_email: "" });
    onClose();
  };

  const submit = () => {
    create.mutate(
      {
        partner_one_name: form.partner_one_name.trim(),
        partner_two_name: form.partner_two_name.trim(),
        wedding_date: form.wedding_date || null,
        contact_email: orNull(form.contact_email),
        create_default_events: true,
      },
      {
        onSuccess: (wedding) => {
          toast.success(`${wedding.couple_names}'s wedding is ready.`);
          onClose();
          navigate(`/weddings/${wedding.id}`);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!create.isPending}
      title="New wedding"
      description="We'll set up a Wedding Day and an Evening Reception for you. You can change these later."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Create wedding
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {create.isError && (
          <div className="span-2">
            <Callout tone="danger">{errorMessage(create.error)}</Callout>
          </div>
        )}
        <TextField
          label="Partner one"
          required
          autoFocus
          placeholder="e.g. Alex"
          value={form.partner_one_name}
          onChange={(e) => setForm({ ...form, partner_one_name: e.target.value })}
          error={fieldErrors.partner_one_name}
        />
        <TextField
          label="Partner two"
          required
          placeholder="e.g. Sam"
          value={form.partner_two_name}
          onChange={(e) => setForm({ ...form, partner_two_name: e.target.value })}
          error={fieldErrors.partner_two_name}
        />
        <TextField
          label="Wedding date"
          type="date"
          optional
          value={form.wedding_date}
          onChange={(e) => setForm({ ...form, wedding_date: e.target.value })}
          error={fieldErrors.wedding_date}
        />
        <TextField
          label="Contact email"
          type="email"
          optional
          hint="Replies to invitation emails go here."
          value={form.contact_email}
          onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          error={fieldErrors.contact_email}
        />
      </div>
    </Modal>
  );
}
