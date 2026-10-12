import { useRef, useState } from "react";
import { errorMessage } from "../../api/client";
import type { ImportResult, WeddingEvent } from "../../api/types";
import { Button } from "../../components/Button";
import { Callout } from "../../components/misc";
import { Modal } from "../../components/Modal";
import { pluralize } from "../../lib/format";
import { eventColumn, sampleCsv, useImportGuests } from "./api";

interface Props {
  weddingId: string;
  events: WeddingEvent[];
  onClose: () => void;
}

export function ImportDialog({ weddingId, events, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const importer = useImportGuests(weddingId);
  const sample = sampleCsv(events);

  const downloadSample = () => {
    const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "guest-list-template.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submit = () => {
    if (!file) return;
    importer.mutate(file, {
      onSuccess: (r) => {
        setResult(r);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      },
    });
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dismissible={!importer.isPending}
      title="Import guests from a spreadsheet"
      description="Save your spreadsheet as CSV (File → Download / Save as → CSV), then upload it here."
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importer.isPending}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" variant="primary" icon="upload" disabled={!file} loading={importer.isPending}>
            Import guests
          </Button>
        </>
      }
    >
      <div className="stack">
        {result && (
          <Callout tone={result.errors.length ? "warning" : "success"}>
            <p>
              <strong>{pluralize(result.created, "guest")} imported.</strong>
              {result.errors.length > 0 && ` ${pluralize(result.errors.length, "row")} could not be imported:`}
            </p>
            {result.errors.length > 0 && (
              <ul className="import-errors">
                {result.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    <strong>Row {e.row}:</strong> {e.message}
                  </li>
                ))}
              </ul>
            )}
          </Callout>
        )}
        {importer.isError && <Callout tone="danger">{errorMessage(importer.error)}</Callout>}

        <div className="field">
          <label className="field-label" htmlFor="import-file">
            CSV file
          </label>
          <input
            ref={inputRef}
            id="import-file"
            className="input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              importer.reset();
            }}
          />
          <span className="field-hint">The first row must be the column names. Maximum 2 MB.</span>
        </div>

        <div className="import-help">
          <h3>Columns</h3>
          <ul className="small">
            <li>
              <span className="kbd">first_name</span>, <span className="kbd">last_name</span> (or a single{" "}
              <span className="kbd">name</span> column)
            </li>
            <li>
              <span className="kbd">email</span>, <span className="kbd">phone</span>, <span className="kbd">group</span>,{" "}
              <span className="kbd">age_group</span> (adult, child or infant),{" "}
              <span className="kbd">dietary_requirements</span>, <span className="kbd">notes</span>
            </li>
            <li>
              One column per event with <em>yes</em> or <em>no</em>:{" "}
              {events.map((e, i) => (
                <span key={e.id}>
                  {i > 0 && ", "}
                  <span className="kbd">{eventColumn(e, events)}</span> ({e.name})
                </span>
              ))}
              . Add <span className="kbd">&lt;event&gt;_plus_one</span> (e.g.{" "}
              <span className="kbd">{events[0] ? `${eventColumn(events[0], events)}_plus_one` : "day_plus_one"}</span>) to
              allow a guest.
            </li>
          </ul>
          <div className="row-between">
            <span className="small muted">Example:</span>
            <button type="button" className="link-btn small" onClick={downloadSample}>
              Download this template
            </button>
          </div>
          <pre className="code-block">{sample}</pre>
        </div>
      </div>
    </Modal>
  );
}
