from app.core.modules import Module
from app.modules.menus.router import router

module = Module(
    name="menus",
    description="Food menus per event, and what each guest and plus-one has chosen",
    router=router,
    depends_on=("tenancy", "weddings", "guests"),
)
