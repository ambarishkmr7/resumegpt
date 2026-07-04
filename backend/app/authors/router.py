"""Authors API.

Public endpoints feed the 'Our Authors' (editorial-team) section. Authenticated
endpoints let an author log in, edit their profile, and publish posts that appear
under their card.

Author auth reuses the shared JWT helper. To keep author tokens distinct from
user tokens, the token subject is prefixed: ``author:<author_id>``.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.rate_limit import limiter
from app.config import get_settings
from app.core.security import create_access_token, decode_token, hash_password, verify_password
from app.database import get_db
from app.models import Author, AuthorPost

router = APIRouter(prefix="/api", tags=["authors"])
settings = get_settings()

_author_oauth = OAuth2PasswordBearer(tokenUrl="/api/author/login", auto_error=False)
_AUTHOR_PREFIX = "author:"


# ── helpers ───────────────────────────────────────────────────────────────
def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


def get_current_author(
    token: Optional[str] = Depends(_author_oauth),
    db: Session = Depends(get_db),
) -> Author:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate author credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    sub = decode_token(token)
    if not sub or not sub.startswith(_AUTHOR_PREFIX):
        raise exc
    author = db.query(Author).filter(
        Author.id == sub[len(_AUTHOR_PREFIX):], Author.is_active == True  # noqa: E712
    ).first()
    if not author:
        raise exc
    return author


# ── schemas ───────────────────────────────────────────────────────────────
class PostOut(BaseModel):
    id: str
    title: str
    slug: str
    excerpt: Optional[str] = None
    content: str
    status: str
    published_at: Optional[str] = None
    updated_at: Optional[str] = None


class AuthorPublicOut(BaseModel):
    id: str
    slug: str
    name: str
    role: Optional[str] = None
    bio: Optional[str] = None
    credentials: Optional[str] = None
    avatar_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    posts: List[PostOut] = []


class LoginIn(BaseModel):
    email: str
    password: str


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    role: Optional[str] = None
    bio: Optional[str] = None
    credentials: Optional[str] = None
    signup_code: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    bio: Optional[str] = None
    credentials: Optional[str] = None
    avatar_url: Optional[str] = None
    linkedin_url: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class PostIn(BaseModel):
    title: str
    content: str
    excerpt: Optional[str] = None
    status: str = "published"


def _post_out(p: AuthorPost) -> PostOut:
    return PostOut(
        id=p.id, title=p.title, slug=p.slug, excerpt=p.excerpt, content=p.content,
        status=p.status,
        published_at=p.published_at.isoformat() if p.published_at else None,
        updated_at=p.updated_at.isoformat() if p.updated_at else None,
    )


def _author_out(a: Author, include_drafts: bool = False) -> AuthorPublicOut:
    posts = sorted(a.posts, key=lambda x: x.created_at or datetime.min, reverse=True)
    if not include_drafts:
        posts = [p for p in posts if p.status == "published"]
    return AuthorPublicOut(
        id=a.id, slug=a.slug, name=a.name, role=a.role, bio=a.bio,
        credentials=a.credentials, avatar_url=a.avatar_url, linkedin_url=a.linkedin_url,
        posts=[_post_out(p) for p in posts],
    )


# ── public ────────────────────────────────────────────────────────────────
@router.get("/authors", response_model=List[AuthorPublicOut])
def list_authors(db: Session = Depends(get_db)):
    authors = (
        db.query(Author)
        .filter(Author.is_active == True)  # noqa: E712
        .order_by(Author.display_order.asc(), Author.created_at.asc())
        .all()
    )
    return [_author_out(a) for a in authors]


@router.get("/authors/{slug}", response_model=AuthorPublicOut)
def get_author(slug: str, db: Session = Depends(get_db)):
    a = db.query(Author).filter(Author.slug == slug, Author.is_active == True).first()  # noqa: E712
    if not a:
        raise HTTPException(status_code=404, detail="Author not found")
    return _author_out(a)


# ── author auth ───────────────────────────────────────────────────────────
@router.post("/author/login")
@limiter.limit("10/minute")
def author_login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    a = db.query(Author).filter(Author.email == body.email.lower().strip()).first()
    if not a or not a.is_active or not verify_password(body.password, a.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(subject=f"{_AUTHOR_PREFIX}{a.id}")
    return {"access_token": token, "token_type": "bearer", "author": _author_out(a, include_drafts=True)}


def _unique_author_slug(db: Session, base: str) -> str:
    slug, n = base, 1
    while db.query(Author).filter(Author.slug == slug).first():
        n += 1
        slug = f"{base}-{n}"
    return slug


@router.post("/author/register")
@limiter.limit("5/minute")
def author_register(request: Request, body: RegisterIn, db: Session = Depends(get_db)):
    """Register a new author (used by the /sys-admin page, role=author).

    If AUTHOR_SIGNUP_CODE is set, the matching code is required; otherwise
    registration is open. New authors are active and immediately visible.
    """
    if settings.AUTHOR_SIGNUP_CODE:
        if (body.signup_code or "") != settings.AUTHOR_SIGNUP_CODE:
            raise HTTPException(status_code=403, detail="Invalid author signup code")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email = body.email.lower().strip()
    if db.query(Author).filter(Author.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    a = Author(
        slug=_unique_author_slug(db, slugify(body.name)),
        name=body.name.strip(),
        role=(body.role or "").strip() or None,
        bio=(body.bio or "").strip() or None,
        credentials=(body.credentials or "").strip() or None,
        email=email,
        hashed_password=hash_password(body.password),
        is_active=True,
    )
    db.add(a); db.commit(); db.refresh(a)
    token = create_access_token(subject=f"{_AUTHOR_PREFIX}{a.id}")
    return {"access_token": token, "token_type": "bearer", "author": _author_out(a, include_drafts=True)}


@router.get("/author/me", response_model=AuthorPublicOut)
def author_me(author: Author = Depends(get_current_author)):
    return _author_out(author, include_drafts=True)


@router.put("/author/me", response_model=AuthorPublicOut)
def update_profile(body: ProfileUpdate, author: Author = Depends(get_current_author),
                   db: Session = Depends(get_db)):
    for field in ("name", "role", "bio", "credentials", "avatar_url", "linkedin_url"):
        val = getattr(body, field)
        if val is not None:
            setattr(author, field, val)
    db.commit(); db.refresh(author)
    return _author_out(author, include_drafts=True)


@router.post("/author/change-password")
def change_password(body: PasswordChange, author: Author = Depends(get_current_author),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, author.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    author.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


# ── author posts ──────────────────────────────────────────────────────────
@router.get("/author/posts", response_model=List[PostOut])
def my_posts(author: Author = Depends(get_current_author)):
    posts = sorted(author.posts, key=lambda x: x.created_at or datetime.min, reverse=True)
    return [_post_out(p) for p in posts]


def _unique_slug(db: Session, base: str, author_id: str, exclude_id: Optional[str] = None) -> str:
    slug = base
    n = 1
    while True:
        q = db.query(AuthorPost).filter(AuthorPost.slug == slug)
        if exclude_id:
            q = q.filter(AuthorPost.id != exclude_id)
        if not q.first():
            return slug
        n += 1
        slug = f"{base}-{n}"


@router.post("/author/posts", response_model=PostOut)
def create_post(body: PostIn, author: Author = Depends(get_current_author),
                db: Session = Depends(get_db)):
    status_val = "draft" if body.status == "draft" else "published"
    slug = _unique_slug(db, slugify(body.title), author.id)
    post = AuthorPost(
        author_id=author.id, title=body.title.strip(), slug=slug,
        excerpt=(body.excerpt or "").strip() or None, content=body.content,
        status=status_val,
        published_at=datetime.utcnow() if status_val == "published" else None,
    )
    db.add(post); db.commit(); db.refresh(post)
    return _post_out(post)


@router.put("/author/posts/{post_id}", response_model=PostOut)
def update_post(post_id: str, body: PostIn, author: Author = Depends(get_current_author),
                db: Session = Depends(get_db)):
    post = db.query(AuthorPost).filter(
        AuthorPost.id == post_id, AuthorPost.author_id == author.id
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    status_val = "draft" if body.status == "draft" else "published"
    post.title = body.title.strip()
    post.excerpt = (body.excerpt or "").strip() or None
    post.content = body.content
    if status_val == "published" and post.status != "published":
        post.published_at = datetime.utcnow()
    post.status = status_val
    db.commit(); db.refresh(post)
    return _post_out(post)


@router.delete("/author/posts/{post_id}")
def delete_post(post_id: str, author: Author = Depends(get_current_author),
                db: Session = Depends(get_db)):
    post = db.query(AuthorPost).filter(
        AuthorPost.id == post_id, AuthorPost.author_id == author.id
    ).first()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    db.delete(post); db.commit()
    return {"ok": True}
