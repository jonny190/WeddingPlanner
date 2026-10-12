// Image library picker with upload (button or drag and drop).
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { cx, Modal } from "./controls";
import { IconCheck, IconUpload } from "./icons";
import type { MediaAsset } from "./types";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function uploadErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const detail = (err as { detail?: unknown; message?: unknown }).detail ?? (err as { message?: unknown }).message;
    if (typeof detail === "string" && detail) return detail;
  }
  return "The upload failed. Please try again.";
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; name: string }
  | { status: "error"; message: string };

/** Upload button + drop zone. Calls `onUploaded` with the stored asset. */
export function UploadZone({
  onUploadImage,
  onUploaded,
  disabled,
}: {
  onUploadImage: (file: File) => Promise<MediaAsset>;
  onUploaded: (asset: MediaAsset) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [over, setOver] = useState(false);
  const busy = state.status === "uploading";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    if (file.type && !ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setState({ status: "error", message: "Please choose a PNG, JPEG, GIF or WebP image." });
      return;
    }
    setState({ status: "uploading", name: file.name });
    try {
      const asset = await onUploadImage(file);
      if (!mounted.current) return;
      setState({ status: "idle" });
      onUploaded(asset);
    } catch (err) {
      if (!mounted.current) return;
      setState({ status: "error", message: uploadErrorMessage(err) });
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) void upload(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={cx("dz-upload", over && "dz-is-over", busy && "dz-is-busy")}
      onDragOver={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="dz-visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void upload(file);
        }}
      />
      <div className="dz-upload-row">
        <button
          type="button"
          className="dz-btn dz-btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          <IconUpload />
          <span>{busy ? "Uploading…" : "Upload image"}</span>
        </button>
        <span className="dz-hint">or drop a PNG, JPEG, GIF or WebP here</span>
      </div>
      <div role="status" aria-live="polite" className="dz-upload-status">
        {state.status === "uploading" && (
          <>
            <span className="dz-upload-name">Uploading {state.name}…</span>
            <span className="dz-progress" aria-hidden="true">
              <span />
            </span>
          </>
        )}
      </div>
      {state.status === "error" && (
        <p className="dz-error" role="alert">
          {state.message}
        </p>
      )}
    </div>
  );
}

export function AssetPicker({
  title,
  description,
  assets,
  assetUrl,
  onUploadImage,
  selectedId,
  onPick,
  onClose,
}: {
  title: string;
  description?: string;
  assets: MediaAsset[];
  assetUrl: (assetId: string) => string;
  onUploadImage: (file: File) => Promise<MediaAsset>;
  selectedId?: string | null;
  onPick: (assetId: string) => void;
  onClose: () => void;
}) {
  const images = useMemo(
    () =>
      assets
        .filter((a) => !a.content_type || a.content_type.startsWith("image/"))
        .slice()
        .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)),
    [assets],
  );
  return (
    <Modal title={title} onClose={onClose} size="lg">
      {description && <p className="dz-modal-desc">{description}</p>}
      <UploadZone onUploadImage={onUploadImage} onUploaded={(asset) => onPick(asset.id)} />
      <h3 className="dz-section-title dz-asset-heading">Your images</h3>
      {images.length === 0 ? (
        <p className="dz-empty">No images yet. Upload one to get started.</p>
      ) : (
        <ul className="dz-asset-grid">
          {images.map((asset) => {
            const selected = asset.id === selectedId;
            return (
              <li key={asset.id}>
                <button
                  type="button"
                  className={cx("dz-asset", selected && "dz-is-selected")}
                  aria-pressed={selected}
                  aria-label={`Use ${asset.filename}`}
                  title={asset.filename}
                  onClick={() => onPick(asset.id)}
                >
                  <img src={assetUrl(asset.id)} alt="" loading="lazy" draggable={false} />
                  {selected && (
                    <span className="dz-asset-check" aria-hidden="true">
                      <IconCheck size={12} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
