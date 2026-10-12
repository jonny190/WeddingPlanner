import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions. */
  tone?: "danger" | "primary";
  /** Require the user to type this text before confirming. */
  typedConfirmation?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onDone={finish} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options, onDone }: { options: ConfirmOptions; onDone: (ok: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const needsTyping = Boolean(options.typedConfirmation);
  const typedOk = !needsTyping || typed.trim() === options.typedConfirmation;
  return (
    <Modal
      open
      size="sm"
      title={options.title}
      onClose={() => onDone(false)}
      onSubmit={() => typedOk && onDone(true)}
      footer={
        <>
          <Button variant="ghost" onClick={() => onDone(false)} data-autofocus={needsTyping ? undefined : true}>
            {options.cancelLabel ?? "Cancel"}
          </Button>
          <Button type="submit" variant={options.tone === "danger" ? "danger" : "primary"} disabled={!typedOk}>
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <div className="stack-sm">
        {options.message && <div className="muted">{options.message}</div>}
        {needsTyping && (
          <label className="field">
            <span className="field-label">
              Type <strong>{options.typedConfirmation}</strong> to confirm
            </span>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Ask the user to confirm: `if (await confirm({...})) doIt()`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}
