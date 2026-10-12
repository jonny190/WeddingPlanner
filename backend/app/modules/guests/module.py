from app.core.modules import Module
from app.modules.guests.router import router

module = Module(
    name="guests",
    description="Guest list and per-event invitations, including plus-ones",
    router=router,
    depends_on=("tenancy", "weddings"),
)
