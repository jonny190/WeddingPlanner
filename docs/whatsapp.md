# Invitations by WhatsApp

How a guest's invitation can go to their phone instead of, or as well as, their inbox. The
user-facing instructions are in `guides/whatsapp-invitations.md`; these notes are for whoever
changes this next.

## The shape of it

- Guests' phone numbers are stored in international format (`+447911123456`). Whatever
  someone types, `guests/phones.py` normalises it with Google's `phonenumbers` library, reading
  numbers without a country code in `PHONE_REGION` (GB by default). Invalid numbers are refused
  at the API with the code `invalid_phone`; CSV rows with a bad number are reported, not
  imported. Only mobiles get WhatsApp messages; a landline is skipped with a reason.
- Every draft has a WhatsApp message (`InvitationDraft.whatsapp_body`) next to its email
  subject and body, with the same placeholders. `None` means the default wording from
  `rendering.default_whatsapp`. The message always carries `{{rsvp_link}}`; it is added at the
  end if the author leaves it out.
- Sending takes a `via`: `email`, `whatsapp`, or `whatsapp_or_email` (WhatsApp where there is a
  mobile, email otherwise). `service._reach` decides, per guest, the channel and address or the
  reason they cannot be reached, and the dry run reports exactly that.
- The link in a WhatsApp message is the same tracked `/i/<token>` link as in an email, so
  opening it counts as an open and marks the invitation sent, and the guest lands on the same
  page.
- A queued message is a row in `invitation_deliveries` with `channel = whatsapp`, the number in
  `to_address` and the text in `body_text`. The worker (`invitations/dispatcher.py`) sends each
  row through the backend for its channel, with the same retries and heartbeat as email.

## The bridge

`notifications/whatsapp.py` defines `WhatsAppBackend` (`send`, `status`) and four
implementations: `WahaBackend` for a real bridge, and console, file and in-memory backends for
development, the end-to-end tests and the unit tests. `WHATSAPP_BACKEND=none` (the default)
builds no backend at all: the API then hides the channel (`GET /invitation-channels`) and
refuses `via=whatsapp` with `whatsapp_disabled`.

WAHA (WhatsApp HTTP API) is a self-hosted bridge that drives an ordinary WhatsApp account over
the web protocol. The backend posts to `POST /api/sendText` with `{session, chatId, text}` where
`chatId` is the number without its plus followed by `@c.us`, and reads `GET
/api/sessions/{session}` for the connection state (`WORKING` means paired and ready). The API
key goes in `X-Api-Key`. `docker-compose.yml` runs it under the `whatsapp` profile with its
session data in the `waha-sessions` volume, so pairing survives restarts.

**This is unofficial.** WhatsApp's terms do not allow automation through the consumer app, and
numbers used this way can be banned without warning. It is a reasonable choice for one couple
sending their own invitations from a number they would not mind losing, and not something to
run for other people's weddings. An official gateway (Meta's Cloud API, Twilio) needs approved
message templates and costs a few pence per message; either would be another `WhatsAppBackend`
class, and nothing above the backend would change.

## Operating it

1. Start the bridge: `WHATSAPP_BACKEND=waha` and `WAHA_API_KEY` in `.env`, then
   `docker compose --profile whatsapp up -d`.
2. Pair a phone once at `http://<host>:3000/dashboard` (the port is bound to localhost by
   default; reach it over SSH or set `WAHA_BIND`). Start a session named `default`, scan the
   QR code with the phone that will send the invitations.
3. The send screen's WhatsApp option then shows the connected number. If the bridge is down or
   the session needs re-pairing, the screen says so and queued messages wait (the worker retries
   with backoff and marks a delivery failed after `DELIVERY_MAX_ATTEMPTS`; "Retry failed" on the
   delivery log re-queues them).

Rate: WAHA sends as fast as it is asked. The worker sends a batch of up to
`WORKER_BATCH_SIZE` rows at a time; for a wedding's worth of guests that is fine, but sending
hundreds of messages in a burst from a fresh number is exactly what gets numbers banned, so
send in audiences rather than everyone at once.

## Tests

`tests/test_whatsapp.py` covers normalisation, the WAHA request shape (against a mock HTTP
transport), the channels endpoint with and without a bridge, the three ways of sending with
their skip reasons, delivery through the worker with the tracked link, test sends, and a worker
without a bridge failing deliveries cleanly. The end-to-end test `whatsapp.spec.ts` sends from
the browser through the file backend and follows the link from the message.
