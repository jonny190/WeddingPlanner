from app.core.modules import Module
from app.modules.invitations.router import public_router, router

module = Module(
    name="invitations",
    description="Invitation card designs, drafts, sending, delivery and link-click tracking",
    router=router,
    public_router=public_router,
    depends_on=("tenancy", "weddings", "guests", "media", "notifications"),
)
