"""Cutout retrieval, PNG tile rendering, and WCS round-trip helpers.

Nothing here invents data: pixels come from the IRSA Cutout Service,
coordinates from astropy WCS objects built from real headers.
"""
from __future__ import annotations

import hashlib
import io
import logging
from typing import Any
from urllib.parse import urlparse

log = logging.getLogger(__name__)

# Only IRSA hosts may serve observation bytes. Redirects are re-checked.
ALLOWED_DATA_HOSTS = ("irsa.ipac.caltech.edu",)


def _assert_allowed_host(url: str) -> None:
    host = (urlparse(url).hostname or "").lower()
    if not host.endswith(tuple(ALLOWED_DATA_HOSTS)):
        raise ValueError(f"Host not allowed for data retrieval: {host or '<none>'}")


def build_cutout_url(access_url: str, ra: float, dec: float, size_deg: float) -> str:
    """Append Cutout Service parameters to a MEF access URL. Pure function."""
    if not access_url.startswith(("https://", "http://")):
        raise ValueError(f"Refusing non-HTTP access URL: {access_url!r}")
    _assert_allowed_host(access_url)
    if not (0.0 <= ra < 360.0):
        raise ValueError(f"RA out of range [0, 360): {ra}")
    if not (-90.0 <= dec <= 90.0):
        raise ValueError(f"Dec out of range [-90, 90]: {dec}")
    if not (0.0 < size_deg <= 1.0):
        raise ValueError(f"Cutout size out of range (0, 1] deg: {size_deg}")
    sep = "&" if "?" in access_url else "?"
    return f"{access_url}{sep}center={ra},{dec}&size={size_deg}"


def fetch_bytes(url: str, timeout_s: float = 60.0, max_bytes: int = 200_000_000) -> bytes:
    """Download a cutout. Validates host + redirects + oversize bodies."""
    import httpx

    if not url.startswith(("https://", "http://")):
        raise ValueError(f"Refusing non-HTTP URL: {url!r}")
    _assert_allowed_host(url)
    with httpx.Client(follow_redirects=False, timeout=timeout_s) as client:
        resp = client.get(url)
        # Resolve redirects manually so each hop is host-checked.
        hops = 0
        while resp.status_code in (301, 302, 303, 307, 308) and hops < 5:
            loc = resp.headers.get("location")
            if not loc:
                raise ValueError("Redirect without Location header.")
            nxt = httpx.URL(url).join(loc)
            _assert_allowed_host(str(nxt))
            resp = client.get(str(nxt))
            hops += 1
        resp.raise_for_status()
        total = 0
        chunks: list[bytes] = []
        for chunk in resp.iter_bytes(1_048_576):
            total += len(chunk)
            if total > max_bytes:
                raise ValueError(f"Response exceeds {max_bytes} bytes; refusing to buffer.")
            chunks.append(chunk)
    log.info("Fetched %d bytes from %s", total, url)
    return b"".join(chunks)


def tile_key(access_url: str, ra: float, dec: float, size_deg: float) -> str:
    seed = f"{access_url}|{ra}|{dec}|{size_deg}".encode()
    return hashlib.sha256(seed).hexdigest()[:16]


def assert_fits_magic(payload: bytes) -> None:
    """Reject bytes that are not a FITS file before handing to astropy."""
    if len(payload) < 8 or payload[:6] != b"SIMPLE":
        raise ValueError("Payload is not a FITS file (missing SIMPLE header).")


def render_png(fits_bytes: bytes, max_dim: int = 1024) -> tuple[bytes, dict[str, Any]]:
    """Render the IMAGE HDU of a cutout MEF to grayscale PNG.

    Percentile clip (1-99) + linear stretch to 8-bit; downsampled so the
    longest side is <= max_dim. Returns (png_bytes, stats).
    """
    import numpy as np
    from astropy.io import fits
    from PIL import Image

    from .fitsmeta import _find_hdu

    with fits.open(io.BytesIO(fits_bytes)) as hdul:
        image_hdu = _find_hdu(hdul, "IMAGE")
        if image_hdu is None or image_hdu.data is None:
            names = [(h.name or "?") for h in hdul]
            raise ValueError(f"Cutout has no usable IMAGE HDU (found: {names})")
        arr = np.asarray(image_hdu.data, dtype=np.float64)
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        raise ValueError("IMAGE HDU contains no finite pixels.")
    lo, hi = float(np.percentile(finite, 1)), float(np.percentile(finite, 99))
    if not (hi > lo):
        hi = lo + 1.0
    scaled = np.clip((arr - lo) / (hi - lo), 0.0, 1.0)
    h, w = scaled.shape
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        nh, nw = max(1, int(h * scale)), max(1, int(w * scale))
        ys = (np.linspace(0, h - 1, nh)).astype(int)
        xs = (np.linspace(0, w - 1, nw)).astype(int)
        scaled = scaled[ys[:, None], xs]
    img = Image.fromarray((scaled * 255).astype("uint8"), mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    stats = {
        "shape": [int(h), int(w)],
        "rendered_shape": [int(scaled.shape[0]), int(scaled.shape[1])],
        "clip_lo": lo,
        "clip_hi": hi,
        "finite_fraction": float(finite.size / arr.size),
    }
    return buf.getvalue(), stats


def sky_to_pixel(header_cards: dict[str, Any], ra: float, dec: float) -> tuple[float, float]:
    """RA/Dec (deg, ICRS) -> 0-based pixel via a real spatial WCS header."""
    from astropy.wcs import WCS

    w = WCS(header_cards)
    x, y = w.world_to_pixel_values(ra, dec)
    return float(x), float(y)


def pixel_to_sky(header_cards: dict[str, Any], x: float, y: float) -> tuple[float, float]:
    """0-based pixel -> RA/Dec (deg, ICRS) via a real spatial WCS header."""
    from astropy.wcs import WCS

    w = WCS(header_cards)
    ra, dec = w.pixel_to_world_values(x, y)
    return float(ra), float(dec)
