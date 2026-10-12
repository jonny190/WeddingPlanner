import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isApiError } from "../../api/client";
import type { LinkOpenResult } from "../../api/types";
import { openTrackedLink } from "./api";
import { PublicLayout, PublicMessage } from "./PublicLayout";

// Record each link open exactly once per page load, even though StrictMode runs effects twice.
const opens = new Map<string, Promise<LinkOpenResult>>();

/** /i/:token — the tracked link in an invitation email. Records the open, then shows the invitation. */
export default function LinkOpenPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let pending = opens.get(token);
    if (!pending) {
      pending = openTrackedLink(token);
      opens.set(token, pending);
    }
    pending.then(
      (res) => {
        if (active) navigate(`/rsvp/${encodeURIComponent(res.rsvp_token)}?event=${res.event_id}`, { replace: true });
      },
      (err: unknown) => {
        // Allow a retry after network or server errors.
        if (!isApiError(err) || err.status === 0 || err.status >= 500) opens.delete(token);
        if (active) setError(err);
      },
    );
    return () => {
      active = false;
    };
  }, [token, navigate, attempt]);

  if (error) {
    const invalid = isApiError(error, 404) || isApiError(error, 422);
    return (
      <PublicLayout>
        <PublicMessage icon="alert" title={invalid ? "This link isn't working" : "Something went wrong"}>
          {invalid ? (
            <p>
              We couldn't find the invitation for this link. Please check you've used the full link from your email,
              or get in touch with the couple.
            </p>
          ) : (
            <>
              <p>We couldn't open your invitation just now. Please check your connection and try again.</p>
              <button
                type="button"
                className="rsvp-btn"
                onClick={() => {
                  setError(null);
                  setAttempt((a) => a + 1);
                }}
              >
                Try again
              </button>
            </>
          )}
        </PublicMessage>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="public-loading" role="status">
        <span className="public-spinner" aria-hidden="true" />
        <p>Opening your invitation…</p>
      </div>
    </PublicLayout>
  );
}
