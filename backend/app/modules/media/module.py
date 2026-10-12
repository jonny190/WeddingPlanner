from app.core.modules import Module
from app.modules.media.router import public_router, router

module = Module(
    name="media",
    description="Image uploads (invitation artwork) and public image serving",
    router=router,
    public_router=public_router,
    depends_on=("tenancy", "weddings"),
)
