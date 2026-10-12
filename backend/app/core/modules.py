"""Feature modules plug into the application through a small, explicit contract.

Each package under ``app/modules`` exposes a ``module`` object (see its
``module.py``). The app factory mounts the routers it declares and the registry
checks that every module's dependencies are installed ahead of it.
"""

from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class Module:
    name: str
    description: str = ""
    # Authenticated, tenant-scoped API mounted under /api/v1.
    router: APIRouter | None = None
    # Unauthenticated API mounted under /api/v1/public (e.g. guest RSVP links).
    public_router: APIRouter | None = None
    depends_on: tuple[str, ...] = ()


def validate_modules(modules: list[Module]) -> None:
    seen: set[str] = set()
    for module in modules:
        if module.name in seen:
            raise RuntimeError(f"Module '{module.name}' is installed twice")
        missing = [dep for dep in module.depends_on if dep not in seen]
        if missing:
            raise RuntimeError(
                f"Module '{module.name}' depends on {missing}, which must be installed before it"
            )
        seen.add(module.name)
