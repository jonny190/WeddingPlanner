import uuid
from dataclasses import dataclass

from app.core.errors import Forbidden
from app.modules.tenancy.models import ROLE_RANK, Role


@dataclass(frozen=True)
class TenantContext:
    """Who is acting, and on behalf of which tenant. Passed to every tenant-scoped service."""

    tenant_id: uuid.UUID
    user_id: uuid.UUID
    role: Role
    # Set when the caller authenticated with an API key rather than a login session. A key
    # without write permission arrives here with the viewer role, whatever its owner's role.
    api_key_id: uuid.UUID | None = None
    # Whether this caller may queue email to guests and members. Always true for a session;
    # for a key, only if it was created with that permission.
    can_send: bool = True

    def has_role(self, minimum: Role) -> bool:
        return ROLE_RANK[self.role] >= ROLE_RANK[minimum]

    @property
    def via_api_key(self) -> bool:
        return self.api_key_id is not None

    def require_send(self) -> None:
        if not self.can_send:
            raise Forbidden(
                "This API key is not allowed to send email. Create one with sending enabled.",
                code="send_not_allowed",
            )
