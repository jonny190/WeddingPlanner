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


class TooManyRequests(AppError):
    status_code = 429
    code = "rate_limited"
    default_message = "Too many requests, please try again shortly"

    def __init__(self, message: str | None = None, *, retry_after: int = 60) -> None:
        super().__init__(message)
        self.retry_after = retry_after


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        body: dict[str, Any] = {"detail": exc.message, "code": exc.code}
        if exc.extra is not None:
            body["extra"] = exc.extra
        headers: dict[str, str] | None = None
        if isinstance(exc, Unauthorized):
            headers = {"WWW-Authenticate": "Bearer"}
        elif isinstance(exc, TooManyRequests):
            headers = {"Retry-After": str(exc.retry_after)}
        return JSONResponse(status_code=exc.status_code, content=body, headers=headers)
