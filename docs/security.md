# Security notes

This is a plain description of the measures in the code and why they are there. It is meant
for whoever changes these areas next.

## Tenant isolation

Every tenant-owned table carries a `tenant_id`. After a request's membership is checked, the
tenant is bound to the database session and a SQLAlchemy hook adds the filter to every
select, update and delete. Writes to another tenant's row raise. Public routes (RSVP pages,
tracked links, images, invitation links) are reached by unguessable tokens; once the token
resolves, the owning tenant is bound in the same way.

One thing to remember: a bound session only sees one tenant. Accepting an invitation needs
to list every account the user belongs to afterwards, so it calls `unbind_tenant` before
building the session response. If you add another cross-account step, do the same.

## Logins and sessions

Passwords are hashed with Argon2. Sign-in hashes a dummy value for unknown emails so the
response time does not reveal which addresses exist. Sessions are JWTs that last twelve
hours and are checked against the user's active flag on every request, so deactivating a
user takes effect immediately.

Changing a password needs the current one. A forgotten password is reset through an emailed
link. The link carries a signed token that includes a fingerprint of the password hash it was
issued for, so it stops working the moment the password changes and cannot be reused. The
forgotten-password request answers the same way whether or not the address is known.

## Joining an account

Nobody is added to an account directly. An admin or owner enters an email address and a
role, and the person receives a link that is valid for seven days. Only a hash of the link's
secret is stored. Opening the link shows the account name, the inviter and the role, then:

- someone with no login creates one, using the invited address;
- someone who already has a login signs in first, and the page brings them back;
- someone signed in with a different address is told the invitation is not theirs.

Inviting the same address again replaces the earlier link. Invitations can be withdrawn from
the account page. Only owners can hand out the owner role.

## Abuse limits

`backend/app/core/ratelimit.py` keeps sliding-window counters in memory, keyed by bucket and
client address (or user id). Three buckets exist:

| Bucket | Applies to | Default |
|---|---|---|
| `auth` | sign in, sign up, forgotten password, reset | 10 per minute per address |
| `public` | RSVP pages, tracked links, calendar files, invitation links | 60 per minute per address |
| `email` | test sends and member invitations | 30 per hour per user |

A refused request gets a 429 with a `Retry-After` header and the error code `rate_limited`.
The client address comes from uvicorn's proxy-header handling, which nginx feeds through
`X-Forwarded-For`. Each API process counts separately, so the real ceiling is the setting
times `WEB_CONCURRENCY`. The limits are meant to blunt password guessing and bulk abuse, not
to meter usage; for a busy deployment add a proxy-level limit as well. The end-to-end tests
raise the limits through environment variables because every test comes from one address.

## Email delivery

Guest invitations go through the `invitation_deliveries` outbox. Workers claim rows with
`SELECT ... FOR UPDATE SKIP LOCKED`, and a row left in `sending` for ten minutes is assumed
to belong to a worker that died and is re-queued. A healthy worker touches every row it still
holds before each send, so a long batch against a slow SMTP server is never mistaken for an
abandoned one and sent twice.

Member invitations and password resets are sent straight away by the API process, through
the same email backend the worker uses.

## Browser side

The session token lives in local storage, so cross-site scripting would be the way to steal
it. React escapes everything it renders and nothing uses `dangerouslySetInnerHTML`. nginx
adds a content security policy from `frontend/security-headers.conf` that only allows
scripts, styles, fonts, images and API calls from the app's own origin. Inline styles are
allowed because the card designer positions layers with style attributes. If a new feature
needs another origin, add it to the policy deliberately rather than loosening it.

All typefaces are bundled with the app from the `@fontsource` packages. Guests' browsers do
not contact Google Fonts or any other third party.

## Uploads and exports

Images are identified by their bytes, never by filename or declared type, and SVG is refused.
Storage keys are checked to stay inside the media root. CSV exports prefix cells that start
with formula characters so spreadsheets do not execute guest-supplied text.
