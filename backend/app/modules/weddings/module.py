from app.core.modules import Module
from app.modules.weddings.router import router

module = Module(
    name="weddings",
    description="Weddings and the events (day, evening, ...) guests are invited to",
    router=router,
    depends_on=("tenancy",),
)
