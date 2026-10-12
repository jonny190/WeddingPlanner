import uuid
from dataclasses import dataclass

from app.modules.tenancy.models import ROLE_RANK, Role


@dataclass(frozen=True)
class TenantContext:
    """Who is acting, and on behalf of which tenant. Passed to every tenant-scoped service."""

    tenant_id: uuid.UUID
    user_id: uuid.UUID
    role: Role

    def has_role(self, minimum: Role) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[minimum]
