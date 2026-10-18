# Invitations by WhatsApp

Guests who have a mobile number on the guest list can get their invitation as a WhatsApp
message instead of an email, with the same personal link to their invitation and reply form.
This needs the WhatsApp bridge to be set up on your server (see `docs/whatsapp.md`); if it is
not, the send screen only offers email.

## Mobile numbers

Enter a guest's mobile in the Mobile field when you add or edit them, or in a `mobile` (or
`phone`) column when you import a spreadsheet. Type it however you like: `07911 123456` or
`+44 7911 123456`. It is stored in international form, and the app tells you if it is not a
number it recognises. Landlines are kept but never get WhatsApp messages.

## Writing the message

Each draft has a WhatsApp message on the Email tab, under the email. It is plain text, with the
same placeholders as the email: `{{first_name}}`, `{{couple_names}}`, `{{event_when}}` and so
on. `{{rsvp_link}}` becomes the tappable link to the guest's invitation; it is added at the end
if you leave it out. Keep it short: the card, the details and the reply form are all behind the
link. The Preview tab shows the message as a named guest would receive it.

## Sending

On the Send tab, choose who should receive it as usual, then how it should go:

- **Email**: as before.
- **WhatsApp, or email for the rest**: guests with a mobile get the message, everyone else
  with an email gets the email. Usually the one to pick.
- **WhatsApp only**: guests with a mobile; nobody else.

"Check who will receive it" lists every guest with how they will be reached, and anyone who
cannot be reached with the reason (no mobile, not a mobile, no email). Nothing is sent until
you confirm. You can send yourself a test message first: choose WhatsApp under "Send a test to
yourself" and enter your own mobile.

Messages go out from the number paired with the bridge, one by one. If the bridge is not ready,
the send screen says why and the messages wait in the queue until it is.

## What guests see

A short message with the link. Opening it shows the same invitation page as from an email, with
the card, the details, the calendar links and the reply slip, and it counts as "opened" on the
Replies page just like an email link.

## A word of caution

The bridge works through an ordinary WhatsApp account, which WhatsApp's terms do not allow, and
numbers used this way can be blocked. Use a number you would not mind losing, send in batches
rather than everyone at once, and do not use it for anyone else's wedding.
