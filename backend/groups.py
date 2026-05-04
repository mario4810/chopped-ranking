from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import secrets
import uuid
from io import BytesIO
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db import (
    Entry,
    Group,
    Membership,
    UPLOADS_DIR,
    User,
    get_session,
    now_utc,
)


CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I confusion
CODE_LEN = 12
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))

router = APIRouter()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LEN))


def db() -> Session:
    s = get_session()
    try:
        yield s
    finally:
        s.close()


def current_user(
    request: Request, session: Annotated[Session, Depends(db)]
) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer token required")
    token = auth.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Bearer token required")
    h = _hash_token(token)
    user = session.execute(
        select(User).where(User.token_hash == h)
    ).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


# ---------- schemas ----------


class UserUpsert(BaseModel):
    user_id: str = Field(min_length=8, max_length=64)
    name: str = Field(min_length=1, max_length=64)
    token: str = Field(min_length=20, max_length=200)


class UserOut(BaseModel):
    id: str
    name: str


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class GroupJoin(BaseModel):
    code: str = Field(min_length=4, max_length=32)


class GroupOut(BaseModel):
    id: str
    name: str
    code: str
    is_owner: bool
    member_count: int
    created_at: str


class EntryOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    score: int
    label: str
    created_at: str
    image_url: str


# ---------- endpoints ----------


@router.post("/users", response_model=UserOut)
def upsert_user(
    payload: UserUpsert,
    request: Request,
    session: Annotated[Session, Depends(db)],
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Empty name")

    token_hash = _hash_token(payload.token)

    # Race-safe upsert: try insert first, fall back to update on conflict so
    # parallel calls (e.g. React StrictMode double-effect) don't 500.
    user = session.get(User, payload.user_id)
    if user is None:
        try:
            user = User(
                id=payload.user_id,
                name=name[:64],
                token_hash=token_hash,
            )
            session.add(user)
            session.commit()
            return UserOut(id=user.id, name=user.name)
        except IntegrityError:
            session.rollback()
            user = session.get(User, payload.user_id)

    if user is None:
        raise HTTPException(status_code=500, detail="Could not upsert user")

    if not hmac.compare_digest(user.token_hash, token_hash):
        raise HTTPException(status_code=401, detail="Token mismatch for user_id")
    user.name = name[:64]
    session.commit()
    return UserOut(id=user.id, name=user.name)


@router.post("/groups", response_model=GroupOut)
def create_group(
    payload: GroupCreate,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
):
    # generate a code that doesn't collide
    for _ in range(8):
        code = _generate_code()
        if not session.execute(select(Group).where(Group.code == code)).first():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not allocate group code")

    group = Group(
        id=str(uuid.uuid4()),
        name=payload.name.strip()[:80],
        code=code,
        created_by=user.id,
        is_private=True,
    )
    session.add(group)
    session.add(Membership(group_id=group.id, user_id=user.id))
    session.commit()
    return _group_out(session, group, user)


@router.post("/groups/join", response_model=GroupOut)
def join_group(
    payload: GroupJoin,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
):
    code = payload.code.strip().upper()
    group = session.execute(select(Group).where(Group.code == code)).scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Invalid code")
    existing = session.get(Membership, (group.id, user.id))
    if not existing:
        session.add(Membership(group_id=group.id, user_id=user.id))
        session.commit()
    return _group_out(session, group, user)


@router.get("/groups", response_model=list[GroupOut])
def list_groups(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
):
    rows = session.execute(
        select(Group)
        .join(Membership, Membership.group_id == Group.id)
        .where(Membership.user_id == user.id)
        .order_by(Group.created_at.desc())
    ).scalars().all()
    return [_group_out(session, g, user) for g in rows]


@router.delete("/groups/{group_id}")
def delete_group(
    group_id: str,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
):
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.created_by != user.id:
        raise HTTPException(status_code=403, detail="Only the owner can delete the group")
    # cascade
    session.query(Entry).filter(Entry.group_id == group.id).delete()
    session.query(Membership).filter(Membership.group_id == group.id).delete()
    session.delete(group)
    session.commit()
    return {"ok": True}


def _require_member(session: Session, user: User, group_id: str) -> Group:
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if not session.get(Membership, (group.id, user.id)):
        raise HTTPException(status_code=403, detail="Not a member")
    return group


@router.post("/groups/{group_id}/entries", response_model=EntryOut)
async def create_entry(
    group_id: str,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
    file: UploadFile = File(...),
):
    group = _require_member(session, user, group_id)

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    try:
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large")

        # Decode + apply EXIF orientation. Don't use a `with` block here:
        # `exif_transpose` and `convert` can return lazy views that still
        # reference the source file. Close intermediates after `pil.load()`.
        try:
            raw = Image.open(BytesIO(content))
            raw.load()
            oriented = ImageOps.exif_transpose(raw) or raw
            pil = oriented.convert("RGB")
            pil.load()
            if oriented is not raw:
                oriented.close()
            raw.close()
        except (UnidentifiedImageError, OSError):
            raise HTTPException(status_code=400, detail="Invalid image file")

        # Lazy import to avoid circular: api.py provides classifier and helpers
        from api import build_label, build_roasts, classifier  # noqa: WPS433

        try:
            attractive_prob, not_attractive_prob = await asyncio.to_thread(
                classifier.predict, pil
            )
        finally:
            pil.close()

        chopped_score = round(not_attractive_prob * 100)
        label = build_label(chopped_score)

        # save image with a non-guessable filename, with EXIF rotation applied
        token = secrets.token_urlsafe(16)
        filename = f"{token}.jpg"
        out_path = Path(UPLOADS_DIR) / filename
        pil.save(out_path, format="JPEG", quality=88, optimize=True)

        entry = Entry(
            id=str(uuid.uuid4()),
            group_id=group.id,
            user_id=user.id,
            image_filename=filename,
            score=chopped_score,
            label=label,
        )
        session.add(entry)
        session.commit()

        return _entry_out(session, entry, request)
    finally:
        await file.close()


@router.get("/groups/{group_id}/entries", response_model=list[EntryOut])
def leaderboard(
    group_id: str,
    request: Request,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(db)],
):
    _require_member(session, user, group_id)
    rows = session.execute(
        select(Entry)
        .where(Entry.group_id == group_id)
        .order_by(Entry.score.desc(), Entry.created_at.desc())
        .limit(50)
    ).scalars().all()
    return [_entry_out(session, e, request) for e in rows]


@router.get("/entries/{entry_id}/image")
def entry_image(
    entry_id: str,
    session: Annotated[Session, Depends(db)],
):
    # Capability URL: image is keyed by an unguessable UUIDv4 (122 bits) which
    # is only ever revealed via the authenticated /groups/:id/entries response.
    # Bare-image route lets <img src> tags work on web without custom headers.
    entry = session.get(Entry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    path = Path(UPLOADS_DIR) / entry.image_filename
    if not path.exists():
        raise HTTPException(status_code=410, detail="Image gone")
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300"},
    )


# ---------- helpers ----------


def _group_out(session: Session, group: Group, user: User) -> GroupOut:
    member_count = session.execute(
        select(Membership).where(Membership.group_id == group.id)
    ).all()
    return GroupOut(
        id=group.id,
        name=group.name,
        code=group.code,
        is_owner=group.created_by == user.id,
        member_count=len(member_count),
        created_at=group.created_at.isoformat() if group.created_at else "",
    )


def _entry_out(session: Session, entry: Entry, request: Request) -> EntryOut:
    user = session.get(User, entry.user_id)
    # Return a relative path; the client prefixes with its configured API base
    # so this works regardless of reverse-proxy setup, scheme, or host.
    return EntryOut(
        id=entry.id,
        user_id=entry.user_id,
        user_name=user.name if user else "anon",
        score=entry.score,
        label=entry.label,
        created_at=entry.created_at.isoformat() if entry.created_at else "",
        image_url=f"/entries/{entry.id}/image",
    )
