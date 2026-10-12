from app.core.modules import Module
from app.modules.tenancy.router import router

module = Module(
    name="tenancy",
    description="Accounts (tenants), users, memberships and authentication",
    router=router,
)
