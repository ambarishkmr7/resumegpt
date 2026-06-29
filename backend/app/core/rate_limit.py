"""Shared rate limiter.

A single ``Limiter`` instance is created here and imported by both the FastAPI
app (``main.py``, where it is registered on ``app.state`` together with the
``RateLimitExceeded`` handler) and the routers that decorate endpoints with
``@limiter.limit(...)``. Keeping one instance avoids the silent no-op that
happens when a router defines its own limiter that the app never registers.

Keying is by client IP (``get_remote_address``). If you run behind a reverse
proxy, make sure the proxy sets a trustworthy ``X-Forwarded-For`` and configure
your ASGI server (e.g. ``uvicorn --proxy-headers``) so the real client IP is
used rather than the proxy's address.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=[])
