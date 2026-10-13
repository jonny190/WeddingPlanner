import { useState } from "react";
import type { GuestChoiceRow, MenuChoicesReport, WeddingEvent } from "../../api/types";
import { useSession } from "../../auth/session";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { SearchInput } from "../../components/fields";
import { pluralize } from "../../lib/format";
import { matches } from "../../lib/utils";
import { RecordChoicesModal } from "./RecordChoicesModal";

/** How many of each dish, and who is having what. */
export function MenuChoices({ weddingId, event, report }: { weddingId: string; event: WeddingEvent; report: MenuChoicesReport }) {
  const { canEdit } = useSession();
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState<GuestChoiceRow | null>(null);
  const optionName = new Map(report.courses.flatMap((c) => c.options.map((o) => [o.id, o.name] as const)));
  const attending = report.rows.filter((r) => r.rsvp_status === "attending");
  const rows = attending.filter((r) => matches([r.full_name, r.plus_one_name], search));

  if (report.courses.length === 0) return null;

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Who is having what</h2>
          <div className="small muted">
            {attending.length === 0
              ? "Nobody has accepted yet."
              : report.people_still_to_choose > 0
                ? `${pluralize(report.people_still_to_choose, "person", "people")} coming still to choose.`
                : "Everyone coming has chosen."}
          </div>
        </div>
      </header>
      <div className="card-body stack">
        <div className="menu-counts">
          {report.courses.map((c) => (
            <div key={c.id} className="menu-count-course">
              <h3 className="section-subtitle">{c.name}</h3>
              <ul className="list-plain">
                {report.counts
                  .filter((n) => n.course_id === c.id)
                  .map((n) => (
                    <li key={n.option_id} className="menu-count">
                      <span>{n.option_name}</span>
                      <strong>{n.count}</strong>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>

        {attending.length > 0 && (
          <>
            <div className="toolbar">
              <SearchInput label="Search guests" placeholder="Search guests…" value={search} onChange={setSearch} />
            </div>
            {rows.length === 0 ? (
              <EmptyState compact icon="search" title="No guests match" />
            ) : (
              <div className="table-wrap">
                <table className="table menu-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      {report.courses.map((c) => (
                        <th key={c.id}>{c.name}</th>
                      ))}
                      <th>Chosen</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.invitation_id}>
                        <td>
                          <strong>{r.full_name}</strong>
                          {r.plus_one_attending && <div className="small muted">with {r.plus_one_name || "a guest"}</div>}
                        </td>
                        {report.courses.map((c) => (
                          <td key={c.id}>
                            <div>{optionName.get(r.choices.guest[c.id] ?? "") ?? <span className="muted">Not yet</span>}</div>
                            {r.plus_one_attending && (
                              <div className="small muted">{optionName.get(r.choices.plus_one[c.id] ?? "") ?? "Not yet"}</div>
                            )}
                          </td>
                        ))}
                        <td>{r.complete ? <Badge tone="success">Complete</Badge> : <Badge tone="warning">Still to choose</Badge>}</td>
                        {canEdit && (
                          <td className="table-actions">
                            <Button size="sm" variant="ghost" icon="edit" onClick={() => setRecording(r)}>
                              Record
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {recording && (
        <RecordChoicesModal weddingId={weddingId} event={event} courses={report.courses} row={recording} onClose={() => setRecording(null)} />
      )}
    </section>
  );
}
