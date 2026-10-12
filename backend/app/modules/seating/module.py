from app.core.modules import Module
from app.modules.seating.router import router

module = Module(
    name="seating",
    description="Room layout (tables and seats), seating rules and table plans",
    router=router,
    depends_on=("tenancy", "weddings", "guests"),
)
