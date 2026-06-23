"""
ViraEdit — Password hashing via passlib + bcrypt.

bcrypt auto-generates a salt per hash, making each hash unique
even for the same password. The work factor is 12 (default) which
takes ~0.25s on modern hardware — slow enough to frustrate brute-force
attacks, fast enough for normal login flows.

Async wrappers run bcrypt in a thread pool so they don't block the
FastAPI event loop during login / register.

Usage (sync):
    hashed = hash_password("my_secret")
    is_valid = verify_password("my_secret", hashed)   # True

Usage (async — preferred in FastAPI endpoints):
    hashed = await hash_password_async("my_secret")
    is_valid = await verify_password_async("my_secret", hashed)
"""
import asyncio
from functools import partial

from passlib.context import CryptContext

# bcrypt with work factor 12 — good balance of security vs. latency (~0.25s)
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Synchronous (used in tests, scripts) ──────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """
    Hash a plain-text password with bcrypt.

    Args:
        plain_password: The user's raw password (never store this).

    Returns:
        A bcrypt hash string to store in the database.
    """
    return _pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Check a plain-text password against a stored bcrypt hash.

    Args:
        plain_password:   What the user typed during login.
        hashed_password:  The hash stored in the User.password_hash column.

    Returns:
        True if the password matches, False otherwise.
        (Never raise — let the caller decide the error message.)
    """
    if not hashed_password or not hashed_password.startswith("$2"):
        return False
    try:
        return _pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


# ── Async wrappers (used in FastAPI endpoints) ────────────────────────────────

async def hash_password_async(plain_password: str) -> str:
    """
    Non-blocking bcrypt hash — runs in thread pool.
    Use this in FastAPI endpoints to avoid blocking the event loop.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, hash_password, plain_password)


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    """
    Non-blocking bcrypt verify — runs in thread pool.
    Use this in FastAPI endpoints to avoid blocking the event loop.
    """
    loop = asyncio.get_event_loop()
    fn = partial(verify_password, plain_password, hashed_password)
    return await loop.run_in_executor(None, fn)
