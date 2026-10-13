from app.core.modules import Module
from app.modules.rsvp.router import public_router, router

module = Module(
    name="rsvp",
    description="Guest-facing RSVP links and the couple's view of replies",
    router=router,
    public_router=public_router,
    depends_on=("tenancy", "weddings", "guests", "menus", "invitations"),
)
