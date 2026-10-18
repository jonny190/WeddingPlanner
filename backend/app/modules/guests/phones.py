"""Guests' phone numbers, kept in international format so WhatsApp can reach them."""

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberFormat, PhoneNumberType

from app.core.errors import BadRequest


def normalise_phone(value: str | None, region: str) -> str | None:
    """Turn what someone typed into +<country><number>, or raise a readable error.

    ``region`` (an ISO country code such as GB) says how to read a number typed without a
    country code; numbers that start with + are read as they are.
    """
    if value is None or not value.strip():
        return None
    try:
        parsed = phonenumbers.parse(value, region)
    except NumberParseException:
        raise BadRequest(
            f"'{value}' is not a phone number we recognise", code="invalid_phone"
        ) from None
    if not phonenumbers.is_valid_number(parsed):
        raise BadRequest(
            f"'{value}' is not a valid phone number for {region} or in international format",
            code="invalid_phone",
        )
    return phonenumbers.format_number(parsed, PhoneNumberFormat.E164)


def mobile_number(value: str | None, region: str) -> str | None:
    """The number in international format if it is a mobile, else None (WhatsApp needs one)."""
    try:
        normalised = normalise_phone(value, region)
    except BadRequest:
        return None
    if normalised is None:
        return None
    kind = phonenumbers.number_type(phonenumbers.parse(normalised, None))
    if kind in (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE):
        return normalised
    return None
