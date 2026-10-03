import os
from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable

import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

load_dotenv()

SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
ALGORITHM = "HS256"
TOKEN_MINUTES = int(os.getenv("TOKEN_MINUTES", "480"))

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
FACULTY_USERNAME = os.getenv("FACULTY_USERNAME", "faculty")
FACULTY_PASSWORD = os.getenv("FACULTY_PASSWORD", "faculty123")

USERS: dict[str, dict[str, str]] = {
    ADMIN_USERNAME: {"password": ADMIN_PASSWORD, "role": "admin"},
    FACULTY_USERNAME: {"password": FACULTY_PASSWORD, "role": "faculty"},
}

bearer = HTTPBearer(auto_error=False)


def authenticate(username: str, password: str) -> str | None:
    user = USERS.get(username)
    if user and user["password"] == password:
        return user["role"]
    return None


def create_token(username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_MINUTES),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def require_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> dict[str, str]:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGORITHM])
        subject = payload.get("sub")
        role = payload.get("role")
        if not subject or role not in {"admin", "faculty"}:
            raise ValueError("Invalid session")
        return {"username": str(subject), "role": str(role)}
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


def require_role(*allowed_roles: str) -> Callable:
    def dependency(user: Annotated[dict[str, str], Depends(require_user)]) -> dict[str, str]:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role is not allowed to perform this action",
            )
        return user

    return dependency
