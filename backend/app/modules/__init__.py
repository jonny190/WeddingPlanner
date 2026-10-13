"""Installed feature modules, in dependency order.

To add a feature, create a package here with models/schemas/service/router and a
``module.py`` exposing ``module = Module(...)``, then append it below. Importing a
module also registers its tables with SQLAlchemy (and therefore with Alembic).
"""

from app.core.modules import Module


def installed_modules() -> list[Module]:
    from app.modules.guests.module import module as guests
    from app.modules.invitations.module import module as invitations
    from app.modules.media.module import module as media
    from app.modules.notifications.module import module as notifications
    from app.modules.rsvp.module import module as rsvp
    from app.modules.seating.module import module as seating
    from app.modules.tenancy.module import module as tenancy
    from app.modules.weddings.module import module as weddings

    return [notifications, tenancy, weddings, guests, media, seating, invitations, rsvp]
