"""
Request safety: which provider URLs the server may call, and a simple per-IP rate limit.

Users can supply any OpenAI-compatible base URL, and the server then makes requests to it.
On a public instance that must not reach the server's own network (SSRF), so hosts that resolve
to private, loopback, link-local, or otherwise reserved addresses are refused unless
IB_ALLOW_PRIVATE_ENDPOINTS is set (for self-hosting with local models), and their redirects
aren't followed.

Note: the check resolves the hostname before the request is made; a hostile DNS server could in
principle answer differently a moment later (DNS rebinding). Public instances should also block
private ranges at the network level for defense in depth.
"""

import ipaddress
import socket
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit

from .config import Settings


class EndpointNotAllowed(ValueError):
    """The base URL isn't one this server is allowed to call."""


def _is_private(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not ip.is_global or ip.is_multicast


def check_endpoint(base_url: str, settings: Settings, is_preset: bool = False) -> None:
    """Raises EndpointNotAllowed if the server shouldn't send requests to `base_url`."""
    parts = urlsplit(base_url.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise EndpointNotAllowed("The base URL must look like https://api.example.com/v1")
    if parts.username or parts.password:
        raise EndpointNotAllowed("Put credentials in the API key field, not in the URL.")
    if not is_preset and not settings.allow_custom_endpoints:
        raise EndpointNotAllowed("This server only allows the built-in providers.")
    if settings.allow_private_endpoints:
        return

    if parts.scheme != "https":
        raise EndpointNotAllowed("This server only connects to https:// endpoints.")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise EndpointNotAllowed(f"Couldn't resolve {parts.hostname}.") from None
    if any(_is_private(info[4][0]) for info in infos):
        raise EndpointNotAllowed(
            "Private and local addresses (like localhost) aren't reachable from this server. "
            "Run Infinite Bookshelf yourself to use local models."
        )


class RateLimiter:
    """Sliding-window request counter per client IP, in memory (one server process)."""

    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()

    def allow(self, client_ip: str) -> bool:
        if self.per_minute <= 0:
            return True
        now = time.monotonic()
        if now - self._last_sweep > 60:
            self._hits = defaultdict(deque, {ip: h for ip, h in self._hits.items() if h and now - h[-1] <= 60})
            self._last_sweep = now
        hits = self._hits[client_ip]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True
