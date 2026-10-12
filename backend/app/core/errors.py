from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base for errors that map cleanly onto an HTTP response."""

    status_code = 400
    code = "bad_request"
    default_message = "Bad request"

    def __init__(
        self, message: str | None = None, *, code: str | None = None, extra: Any = None
    ) -> None:
        self.message = message or self.default_message
        if code:
            self.code = code
        self.extra = extra
        super().__init__(self.message)


class BadRequest(AppError):
    pass


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"
    default_message = "Authentication required"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"
    default_message = "You do not have permission to do that"


class NotFound(AppError):
    status_code = 404
    code = "not_found"
    default_message = "Not found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"
    default_message = "Conflict"


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        body: dict[str, Any] = {"detail": exc.message, "code": exc.code}
        if exc.extra is not None:
            body["extra"] = exc.extra
        headers = {"WWW-Authenticate": "Bearer"} if isinstance(exc, Unauthorized) else None
        return JSONResponse(status_code=exc.status_code, content=body, headers=headers)
