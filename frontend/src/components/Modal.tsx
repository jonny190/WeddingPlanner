import { useEffect, useId, useRef, type FormEvent, type ReactNode } from "react";
import { cx } from "../lib/utils";
import { IconButton } from "./Button";

let openModals = 0;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** When false, Escape and backdrop clicks do nothing (e.g. while saving). */
  dismissible?: boolean;
  /** Wrap the body and footer in a form, so Enter submits. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

/** Accessible modal built on the native <dialog> element (focus trap, Escape, top layer). */
export function Modal(props: ModalProps) {
  if (!props.open) return null;
  return <ModalDialog {...props} />;
}

function ModalDialog({
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  onSubmit,
  className,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const pressedOnBackdrop = useRef(false);
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    // React's autoFocus runs before the dialog is shown, so pick the starting focus here:
    // an element marked data-autofocus, else the first form control in the body.
    const initial =
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      dialog
        .querySelector(".modal-body")
        ?.querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), textarea:not([disabled]):not([readonly]), select:not([disabled])",
        );
    initial?.focus();
    openModals += 1;
    document.documentElement.style.overflow = "hidden";
    const onCancel = (event: Event) => {
      event.preventDefault();
      if (dismissibleRef.current) onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      openModals = Math.max(0, openModals - 1);
      if (openModals === 0) document.documentElement.style.overflow = "";
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, []);

  const content = (
    <>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </>
  );

  return (
    <dialog
      ref={ref}
      className={cx("modal", size !== "md" && `modal-${size}`, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current && dismissible) onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && (
            <p className="modal-desc" id={descId}>
              {description}
            </p>
          )}
        </div>
        <IconButton icon="close" label="Close" onClick={onClose} disabled={!dismissible} />
      </div>
      {onSubmit ? (
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>
  );
}
