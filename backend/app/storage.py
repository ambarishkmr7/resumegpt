"""S3-compatible storage abstraction layer.

Supports two backends driven by the ``STORAGE_BACKEND`` setting:

- ``"local"``  – filesystem-based storage under ``STORAGE_DIR`` (default, for dev).
- ``"s3"``     – any S3-compatible service (Cloudflare R2, AWS S3, MinIO, etc.).

For Cloudflare R2 set in ``.env``::

    STORAGE_BACKEND=s3
    S3_ENDPOINT_URL=https://<account_id>.r2.cloudflarestorage.com
    S3_ACCESS_KEY_ID=<r2-access-key>
    S3_SECRET_ACCESS_KEY=<r2-secret-key>
    S3_BUCKET_NAME=resumegpt
    S3_REGION=auto

For AWS S3 later, just change the endpoint and region::

    STORAGE_BACKEND=s3
    S3_ENDPOINT_URL=          # empty → boto3 default AWS endpoint
    S3_ACCESS_KEY_ID=<aws-key>
    S3_SECRET_ACCESS_KEY=<aws-secret>
    S3_BUCKET_NAME=my-bucket
    S3_REGION=us-east-1
"""
from __future__ import annotations

import io
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# S3 backend helper
# ---------------------------------------------------------------------------

def _build_s3_client(endpoint_url: str, access_key: str, secret_key: str, region: str):
    """Return a configured ``boto3`` S3 client."""
    import boto3

    session_kwargs: dict = {}
    client_kwargs: dict = {"region_name": region}

    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url

    if access_key:
        client_kwargs["aws_access_key_id"] = access_key
    if secret_key:
        client_kwargs["aws_secret_access_key"] = secret_key

    session = boto3.Session(**session_kwargs)
    return session.client("s3", **client_kwargs)


# ---------------------------------------------------------------------------
# Storage service
# ---------------------------------------------------------------------------

class StorageService:
    """Unified interface for uploading / downloading / deleting files.

    Usage::

        storage = StorageService(settings)
        key = storage.upload_bytes(data, "uploads/abc123.pdf", content_type="application/pdf")
        raw = storage.download_bytes(key)
        storage.delete_object(key)
    """

    def __init__(self, settings) -> None:
        self._backend: str = getattr(settings, "STORAGE_BACKEND", "local").lower()
        self._s3_bucket: str = getattr(settings, "S3_BUCKET_NAME", "resumegpt")

        if self._backend == "s3":
            self._s3 = _build_s3_client(
                endpoint_url=getattr(settings, "S3_ENDPOINT_URL", ""),
                access_key=getattr(settings, "S3_ACCESS_KEY_ID", ""),
                secret_key=getattr(settings, "S3_SECRET_ACCESS_KEY", ""),
                region=getattr(settings, "S3_REGION", "auto"),
            )
            logger.info("Storage backend: S3 (bucket=%s)", self._s3_bucket)
        else:
            self._local_root = Path(getattr(settings, "STORAGE_DIR", "./storage"))
            self._local_root.mkdir(parents=True, exist_ok=True)
            logger.info("Storage backend: local (root=%s)", self._local_root)

    # -- public interface ---------------------------------------------------

    def upload_bytes(
        self,
        data: bytes,
        key: str,
        content_type: Optional[str] = None,
    ) -> str:
        """Store *data* at *key* and return the key."""
        if self._backend == "s3":
            extra: dict = {}
            if content_type:
                extra["ContentType"] = content_type
            self._s3.put_object(Bucket=self._s3_bucket, Key=key, Body=data, **extra)
        else:
            path = self._local_root / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return key

    def download_bytes(self, key: str) -> bytes:
        """Return the bytes stored at *key*."""
        if self._backend == "s3":
            buf = io.BytesIO()
            self._s3.download_fileobj(self._s3_bucket, key, buf)
            return buf.getvalue()
        else:
            return (self._local_root / key).read_bytes()

    def delete_object(self, key: str) -> None:
        """Delete the object at *key* (no-op if it doesn't exist)."""
        if not key:
            return
        try:
            if self._backend == "s3":
                self._s3.delete_object(Bucket=self._s3_bucket, Key=key)
            else:
                path = self._local_root / key
                if path.exists():
                    path.unlink()
        except Exception:
            logger.warning("Failed to delete storage object %s", key, exc_info=True)

    def get_presigned_url(self, key: str, expires_in: int = 3600) -> Optional[str]:
        """Return a pre-signed GET URL for *key*, or ``None`` for local backend."""
        if self._backend == "s3":
            try:
                return self._s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._s3_bucket, "Key": key},
                    ExpiresIn=expires_in,
                )
            except Exception:
                logger.warning("Failed to generate presigned URL for %s", key, exc_info=True)
                return None
        return None
