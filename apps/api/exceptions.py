"""
ViraEdit — Exception hierarchy and standard error response format.

All errors return this JSON shape:
    {
        "error": "ASSET_NOT_FOUND",
        "message": "The video you requested doesn't exist or you don't have access.",
        "request_id": "req_abc123",
        "details": {"asset_id": "..."}
    }

Rules:
- error codes: SCREAMING_SNAKE_CASE
- messages: plain English, friendly, never technical jargon
- details: machine-readable context for debugging
"""
from __future__ import annotations

from typing import Any


class ViraEditError(Exception):
    """
    Base class for all ViraEdit application errors.
    Caught by the FastAPI exception handler and returned as standard JSON.
    """

    def __init__(
        self,
        error_code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self, request_id: str | None = None) -> dict[str, Any]:
        return {
            "error": self.error_code,
            "message": self.message,
            "request_id": request_id,
            "details": self.details,
        }


# ── Auth errors ────────────────────────────────────────────────────────────────

class NotAuthenticatedError(ViraEditError):
    def __init__(
        self,
        message: str = "You need to be logged in to do that. Please sign in and try again.",
    ) -> None:
        super().__init__(
            error_code="NOT_AUTHENTICATED",
            message=message,
            status_code=401,
        )


class InvalidTokenError(ViraEditError):
    def __init__(self) -> None:
        super().__init__(
            error_code="INVALID_TOKEN",
            message="Your session has expired or is invalid. Please sign in again.",
            status_code=401,
        )


class ForbiddenError(ViraEditError):
    def __init__(self, resource: str = "this resource") -> None:
        super().__init__(
            error_code="FORBIDDEN",
            message=f"You don't have permission to access {resource}.",
            status_code=403,
        )


class WrongPasswordError(ViraEditError):
    def __init__(self) -> None:
        super().__init__(
            error_code="WRONG_PASSWORD",
            message="Incorrect password. Please try again.",
            status_code=401,
        )


class UserNotFoundError(ViraEditError):
    def __init__(self, email: str) -> None:
        super().__init__(
            error_code="USER_NOT_FOUND",
            message=f"No account found with email '{email}'. Did you use a different email?",
            status_code=404,
            details={"email": email},
        )


class EmailAlreadyExistsError(ViraEditError):
    def __init__(self, email: str) -> None:
        super().__init__(
            error_code="EMAIL_ALREADY_EXISTS",
            message=f"An account with '{email}' already exists. Try signing in instead.",
            status_code=409,
            details={"email": email},
        )


# Alias used in auth router
class DuplicateEmailError(ViraEditError):
    def __init__(self, email: str) -> None:
        super().__init__(
            error_code="DUPLICATE_EMAIL",
            message=f"An account with '{email}' already exists. Try signing in instead.",
            status_code=409,
            details={"email": email},
        )


# ── Resource errors ────────────────────────────────────────────────────────────

class ProjectNotFoundError(ViraEditError):
    def __init__(self, project_id: str) -> None:
        super().__init__(
            error_code="PROJECT_NOT_FOUND",
            message="This project doesn't exist or you don't have access to it.",
            status_code=404,
            details={"project_id": project_id},
        )


class AssetNotFoundError(ViraEditError):
    def __init__(self, asset_id: str) -> None:
        super().__init__(
            error_code="ASSET_NOT_FOUND",
            message="The video or audio file you requested doesn't exist.",
            status_code=404,
            details={"asset_id": asset_id},
        )


class TimelineNotFoundError(ViraEditError):
    def __init__(self, timeline_id: str) -> None:
        super().__init__(
            error_code="TIMELINE_NOT_FOUND",
            message="The timeline you requested doesn't exist.",
            status_code=404,
            details={"timeline_id": timeline_id},
        )


# ── File/upload errors ─────────────────────────────────────────────────────────

class FileTooLargeError(ViraEditError):
    def __init__(self, max_size_gb: float = 10.0) -> None:
        super().__init__(
            error_code="FILE_TOO_LARGE",
            message=f"File is too large. Maximum size is {max_size_gb}GB.",
            status_code=413,
            details={"max_size_gb": max_size_gb},
        )


class UnsupportedFileTypeError(ViraEditError):
    def __init__(self, mime_type: str) -> None:
        super().__init__(
            error_code="UNSUPPORTED_FILE_TYPE",
            message=(
                f"File type '{mime_type}' is not supported. "
                "Please upload an MP4, MOV, MKV, MP3, or WAV file."
            ),
            status_code=415,
            details={"mime_type": mime_type},
        )


# ── AI / processing errors ─────────────────────────────────────────────────────

class BudgetExceededError(ViraEditError):
    def __init__(self, limit_usd: float, current_usd: float, project_id: str) -> None:
        super().__init__(
            error_code="BUDGET_EXCEEDED",
            message=(
                f"AI processing cost limit of ${limit_usd:.2f}/hour reached. "
                "The project will switch to faster local processing."
            ),
            status_code=402,
            details={
                "project_id": project_id,
                "limit_usd": limit_usd,
                "current_usd": round(current_usd, 4),
            },
        )


class TranscriptionFailedError(ViraEditError):
    def __init__(self, asset_id: str, reason: str = "") -> None:
        super().__init__(
            error_code="TRANSCRIPTION_FAILED",
            message=(
                "We couldn't transcribe your video. "
                "Please check that the audio is clear and try again."
            ),
            status_code=500,
            details={"asset_id": asset_id, "reason": reason},
        )


class RenderFailedError(ViraEditError):
    def __init__(self, render_id: str, reason: str = "") -> None:
        super().__init__(
            error_code="RENDER_FAILED",
            message=(
                "Video export failed. "
                "Your edits are saved — please try exporting again."
            ),
            status_code=500,
            details={"render_id": render_id, "reason": reason},
        )


class AIUnavailableError(ViraEditError):
    def __init__(self, feature: str = "AI analysis") -> None:
        super().__init__(
            error_code="AI_UNAVAILABLE",
            message=(
                f"{feature} is temporarily unavailable. "
                "Your video has been saved. Please try again in a few minutes."
            ),
            status_code=503,
        )


# ── Storage errors ─────────────────────────────────────────────────────────────

class StorageError(ViraEditError):
    def __init__(self, message: str = "File storage error. Please try again.") -> None:
        super().__init__(
            error_code="STORAGE_ERROR",
            message=message,
            status_code=500,
        )


# ── Validation errors ──────────────────────────────────────────────────────────

class ValidationError(ViraEditError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(
            error_code="VALIDATION_ERROR",
            message=message,
            status_code=422,
            details={"field": field},
        )
