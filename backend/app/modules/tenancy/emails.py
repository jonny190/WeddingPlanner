"""The emails the accounts module sends: invitations to join an account and password resets."""

import html

from app.modules.notifications.email import EmailMessage

_ROLE_BLURB = {
    "owner": "as an owner, with full control of the account",
    "admin": "as an admin, able to manage members and everything in the account",
    "editor": "as an editor, able to work on weddings, guests, invitations and seating",
    "viewer": "as a viewer, able to look at everything but change nothing",
}


def _wrap(title: str, paragraphs: list[str], button_text: str, link: str) -> str:
    body = "".join(f'<p style="margin:0 0 16px;line-height:1.6">{p}</p>' for p in paragraphs)
    return (
        '<!doctype html><html><body style="margin:0;background:#f6f1eb;'
        "font-family:Georgia,'Times New Roman',serif;color:#3b302a;font-size:17px\">"
        '<div style="max-width:560px;margin:0 auto;padding:32px 16px">'
        '<div style="background:#ffffff;border-radius:12px;padding:32px 28px">'
        f'<h1 style="margin:0 0 20px;font-size:24px;font-weight:600">{html.escape(title)}</h1>'
        f"{body}"
        f'<p style="margin:24px 0 8px"><a href="{html.escape(link)}" style="display:inline-block;'
        "padding:13px 30px;background:#7a5c4f;color:#ffffff;text-decoration:none;"
        'border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">'
        f"{html.escape(button_text)}</a></p>"
        '<p style="margin:16px 0 0;font-size:13px;color:#8a7566">If the button does not work, '
        f"copy this address into your browser:<br>{html.escape(link)}</p>"
        "</div></div></body></html>"
    )


def invite_email(
    *,
    to: str,
    account_name: str,
    inviter_name: str | None,
    role: str,
    link: str,
    expires_in_days: int,
) -> EmailMessage:
    who = f"{inviter_name} has" if inviter_name else "You have been"
    blurb = _ROLE_BLURB.get(role, f"as {role}")
    subject = f"{inviter_name or 'Someone'} invited you to {account_name}"
    text = (
        f"{who} invited you to join {account_name} on Wedding Planner {blurb}.\n\n"
        f"Open this link to accept:\n{link}\n\n"
        f"The link works for {expires_in_days} days. If you were not expecting this, "
        "you can ignore this email and nothing will change.\n"
    )
    paragraphs = [
        f"{html.escape(who)} invited you to join <strong>{html.escape(account_name)}</strong> "
        f"on Wedding Planner {html.escape(blurb)}.",
        f"The link works for {expires_in_days} days. If you were not expecting this, you can "
        "ignore this email and nothing will change.",
    ]
    return EmailMessage(
        to=to,
        subject=subject,
        text=text,
        html=_wrap(f"Join {account_name}", paragraphs, "Accept the invitation", link),
    )


def password_reset_email(*, to: str, name: str, link: str, expires_in_minutes: int) -> EmailMessage:
    first = name.split(" ")[0] if name else "there"
    text = (
        f"Hi {first},\n\n"
        "Someone asked to reset the password for your Wedding Planner login. If that was you, "
        f"open this link to choose a new password:\n{link}\n\n"
        f"The link works for {expires_in_minutes} minutes and only once. If you did not ask "
        "for this, you can ignore this email and your password will stay as it is.\n"
    )
    paragraphs = [
        f"Hi {html.escape(first)},",
        "Someone asked to reset the password for your Wedding Planner login. If that was "
        "you, use the button below to choose a new password.",
        f"The link works for {expires_in_minutes} minutes and only once. If you did not ask "
        "for this, you can ignore this email and your password will stay as it is.",
    ]
    return EmailMessage(
        to=to,
        subject="Reset your Wedding Planner password",
        text=text,
        html=_wrap("Reset your password", paragraphs, "Choose a new password", link),
    )
