"""
ViraEdit — structlog configuration.

Development: colorful human-readable output in terminal.
Production: JSON output for log aggregation (Grafana Loki, Datadog, etc.).

Usage:
    from logging_config import configure_logging, get_logger
    configure_logging("development")
    log = get_logger()
    log.info("event_name", key="value")
"""
import logging
import sys

import structlog


def configure_logging(environment: str = "development") -> None:
    """
    Set up structlog for the given environment.
    Call once at application startup (in FastAPI lifespan).
    """
    # Shared processors for all environments
    shared_processors = [
        structlog.contextvars.merge_contextvars,          # request_id, user_id context
        # NOTE: add_logger_name requires stdlib logger — not used with PrintLoggerFactory
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if environment == "development":
        # Pretty, colorful, human-readable — great for local development
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(
                colors=True,
                exception_formatter=structlog.dev.plain_traceback,
            )
        ]
    else:
        # JSON output — structured for log aggregation in production
        processors = shared_processors + [
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(logging.DEBUG),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib logging to route through structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.DEBUG if environment == "development" else logging.INFO,
    )

    # Silence noisy libraries
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)


def get_logger(name: str = "viraedit") -> structlog.BoundLogger:
    """Get a named structlog logger. Use at module level: log = get_logger()"""
    return structlog.get_logger(name)
