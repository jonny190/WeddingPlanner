from app.core.modules import Module
from app.modules.tenancy.router import public_router, router

module = Module(
    name="tenancy",
    description="Accounts (tenants), users, memberships, invitations and authentication",
    router=router,
    public_router=public_router,
    # Member invitations and password resets go out by email.
    depends_on=("notifications",),
)
