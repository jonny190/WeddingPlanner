import { useState } from "react";
import type { Delivery } from "../../api/types";
import { useSession } from "../../auth/session";
import { DeliveryBadge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { ErrorState } from "../../components/EmptyState";
import { Icon } from "../../components/Icon";
import { Callout } from "../../components/misc";
import { PageLoader } from "../../components/Spinner";
import { useToast } from "../../components/Toasts";
import { formatDateTime, formatRelative, pluralize } from "../../lib/format";
import { useDeliveries, useRetryFailed } from "./api";

interface Props {
  weddingId: string;
  eventId: string;
  /** Only show the most recent N rows until "Show all" is pressed. */
  limit?: number;
}

export function DeliveryLog({ weddingId, eventId, limit = 25 }: Props) {
  const { canEdit } = useSession();
  const deliveries = useDeliveries(weddingId, eventId);
  const retry = useRetryFailed(weddingId, eventId);
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);

  const list = deliveries.data ?? [];
  const waiting = list.filter((d) => d.status === "queued" || d.status === "sending").length;
  const failed = list.filter((d) => d.status === "failed").length;
  const shown = showAll ? list : list.slice(0, limit);

  const onRetry = async () => {
    try {
      const res = await retry.mutateAsync();
      toast.success(`${pluralize(res.affected, "email")} queued to try again.`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <section className="card">
      <header className="card-header">
        <div>
          <h2 className="section-title">Delivery log</h2>
          <div className="small muted">Every email sent for this event, newest first.</div>
        </div>
        <div className="row">
          {canEdit && failed > 0 && (
            <Button icon="refresh" variant="danger-ghost" onClick={() => void onRetry()} loading={retry.isPending}>
              Retry {pluralize(failed, "failed email")}
            </Button>
          )}
          <Button
            icon="refresh"
            variant="ghost"
            onClick={() => void deliveries.refetch()}
            loading={deliveries.isFetching && !deliveries.isPending}
          >
            Refresh
          </Button>
        </div>
      </header>
      <div className="card-body stack-sm">
        <Callout tone="info" icon="clock">
          Emails are handed to a background sender, so they show as <strong>Queued</strong> for a moment before
          they're sent.
          {waiting > 0 && (
            <>
              {" "}
              {pluralize(waiting, "email")} waiting. This list refreshes automatically.
            </>
          )}
        </Callout>
        {deliveries.isPending ? (
          <PageLoader label="Loading deliveries…" />
        ) : deliveries.isError ? (
          <ErrorState compact error={deliveries.error} onRetry={() => void deliveries.refetch()} />
        ) : list.length === 0 ? (
          <p className="muted small" style={{ margin: "8px 0" }}>
            Nothing sent yet.
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Status</th>
                    <th>Subject</th>
                    <th>Queued</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                </tbody>
              </table>
            </div>
            {list.length > limit && (
              <button type="button" className="link-btn small" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show fewer" : `Show all ${list.length}`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function DeliveryRow({ delivery: d }: { delivery: Delivery }) {
  return (
    <tr>
      <td>
        <div className="cell-title">
          {d.is_test ? (
            <span className="row" style={{ gap: 6 }}>
              <span className="tag">Test</span> {d.to_address}
            </span>
          ) : (
            (d.guest_name ?? "Guest")
          )}
        </div>
        {!d.is_test && (
          <div className="cell-sub">
            {d.channel === "manual" ? (
              <>
                <Icon name="mail" size={12} /> Marked as sent (post or in person)
              </>
            ) : (
              d.to_address
            )}
          </div>
        )}
      </td>
      <td>
        <DeliveryBadge status={d.status} />
        {d.error && <div className="tiny delivery-error">{d.error}</div>}
        {d.attempts > 1 && <div className="tiny muted">{d.attempts} attempts</div>}
      </td>
      <td className="small" style={{ maxWidth: 280 }}>
        {d.subject}
      </td>
      <td className="small nowrap" title={formatDateTime(d.created_at)}>
        {formatRelative(d.created_at)}
      </td>
      <td className="small nowrap" title={d.sent_at ? formatDateTime(d.sent_at) : undefined}>
        {d.sent_at ? formatRelative(d.sent_at) : "—"}
      </td>
    </tr>
  );
}
