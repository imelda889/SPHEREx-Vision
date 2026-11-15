"""SIA2 metadata queries against IRSA (read-only).

Uses astroquery (the approach recommended by the official SPHEREx tutorials).
Pure URL builder kept separate so tests never need the network.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import Future
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from typing import Any
from urllib.parse import urlencode

from requests.exceptions import (
    ChunkedEncodingError,
    ConnectionError as RequestConnectionError,
    SSLError,
    Timeout as RequestTimeout,
)

from . import config

log = logging.getLogger(__name__)

KNOWN_COLLECTIONS = (
    "spherex_dr1",
    "spherex_dr1_deep",
    "spherex_dr1_cube",
    "spherex_qr3",
    "spherex_qr3_deep",
)

# Astroquery bandpass names look like "SPHEREx-D3" -> detector/band 3.
_BANDPASS_PREFIX = "SPHEREx-D"


# Approved official download hosts. `fetch_bytes` and the preview path refuse
# anything outside this set; redirects are re-checked against it too.
ALLOWED_DATA_HOSTS = ("irsa.ipac.caltech.edu",)


def build_sia_url(base_url: str, collection: str, ra: float, dec: float, radius_deg: float) -> str:
    """Build a SIA2 query URL. Pure function — unit tested without network."""
    if collection not in KNOWN_COLLECTIONS:
        raise ValueError(f"Unknown collection {collection!r}. Known: {sorted(KNOWN_COLLECTIONS)}")
    if not (0.0 <= ra < 360.0):
        raise ValueError(f"RA out of range [0, 360): {ra}")
    if not (-90.0 <= dec <= 90.0):
        raise ValueError(f"Dec out of range [-90, 90]: {dec}")
    if not (0.0 < radius_deg <= 1.0):
        raise ValueError(f"Radius out of range (0, 1] deg: {radius_deg}")
    params = {
        "COLLECTION": collection,
        "POS": f"circle {ra} {dec} {radius_deg}",
    }
    return f"{base_url}?{urlencode(params)}"


def detector_from_bandpass(bandpass: str | None) -> int | None:
    """'SPHEREx-D3' -> 3. Returns None (never raises) when unparseable."""
    if not bandpass or not bandpass.startswith(_BANDPASS_PREFIX):
        return None
    try:
        n = int(bandpass[len(_BANDPASS_PREFIX):])
    except ValueError:
        return None
    return n if 1 <= n <= 6 else None


def parse_s_region(value: str | None) -> dict[str, Any] | None:
    """Parse an STCS footprint into plain JSON.

    Observed live: ``POLYGON ICRS lon lat ...`` quadrilaterals (all 258 rows
    of the validation cone, Nov 2026). ``CIRCLE`` is supported defensively
    though not observed. Anything else (null, empty, malformed, wrong
    coordinate counts) yields None — never raises, never invents geometry.
    """
    if not isinstance(value, str):
        return None
    parts = value.strip().split()
    if not parts:
        return None
    kind = parts[0].upper()
    rest = parts[1:]
    # Optional frame token (e.g. ICRS) is accepted and ignored.
    if rest and rest[0].upper() in ("ICRS", "J2000", "FK5", "GALACTIC"):
        rest = rest[1:]
    try:
        nums = [float(x) for x in rest]
    except ValueError:
        return None
    if any(not (n == n) or n in (float("inf"), float("-inf")) for n in nums):
        return None
    if kind == "POLYGON":
        if len(nums) < 6 or len(nums) % 2 != 0:
            return None
        verts = [[nums[i], nums[i + 1]] for i in range(0, len(nums), 2)]
        return {"kind": "polygon", "vertices": verts}
    if kind == "CIRCLE":
        if len(nums) != 3 or nums[2] <= 0:
            return None
        return {"kind": "circle", "center": [nums[0], nums[1]], "radius_deg": nums[2]}
    return None


def normalize_row(row: dict[str, Any], collection: str) -> dict[str, Any]:
    """Map one ObsCore row to the app Observation record. Missing optional fields -> None."""
    bandpass = row.get("energy_bandpassname")
    detector = detector_from_bandpass(bandpass if isinstance(bandpass, str) else None)
    s_region = row.get("s_region")
    s_region_str = s_region if isinstance(s_region, str) and s_region.strip() else None
    return {
        "obs_id": row.get("obs_id"),
        "collection": collection,
        "detector": detector,
        "band": detector,  # Detector N observes band N (verified: D3 em range == band 3).
        "em_min_m": row.get("em_min"),
        "em_max_m": row.get("em_max"),
        "t_min_mjd": row.get("t_min"),
        "t_max_mjd": row.get("t_max"),
        "s_fov_deg": row.get("s_fov"),
        "calib_level": row.get("calib_level"),
        "access_url": row.get("access_url"),
        "access_format": row.get("access_format"),
        "cloud_access": row.get("cloud_access"),
        "obs_release_date": row.get("obs_release_date"),
        # Raw STCS footprint string (e.g. "POLYGON ICRS lon lat ..."), passed
        # through untouched; parsed form below. Never fabricated.
        "s_region": s_region_str,
        "footprint": parse_s_region(s_region_str),
    }


def group_by_obsid(records: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """Deduplicate rows per observation ID. Rows without obs_id are dropped (logged)."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        oid = rec.get("obs_id")
        if not oid:
            log.warning("Dropping SIA row without obs_id")
            continue
        grouped.setdefault(str(oid), []).append(rec)
    return grouped


# Small pool for blocking SIA calls. The deadline in query_sia frees the
# caller; a thread stuck on a stalled upstream response is abandoned (it
# cannot be killed) and eventually reaped when the response ends. Sized for
# a demo backend, not for bulk harvest.
_SIA_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="spherex-sia")
_SIA_IN_FLIGHT_LOCK = threading.RLock()
_SIA_IN_FLIGHT: dict[tuple[str, float, float, float], Future[list[dict[str, Any]]]] = {}

_SIA_MAX_ATTEMPTS = 3
_SIA_RETRY_BASE_DELAY_S = 0.25
_SIA_RETRY_MAX_DELAY_S = 0.5
_SIA_RETRYABLE_STATUS_CODES = frozenset({502, 503, 504})


class SIAUnavailableError(TimeoutError):
    """A transient SIA failure remained after retrying or exceeded its deadline."""


def _exception_chain(exc: BaseException) -> list[BaseException]:
    chain: list[BaseException] = []
    pending = [exc]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        chain.append(current)
        for cause in (
            getattr(current, "cause", None),
            current.__cause__,
            current.__context__,
        ):
            if isinstance(cause, BaseException) and id(cause) not in seen:
                pending.append(cause)
    return chain


def _is_transient_sia_error(exc: BaseException) -> bool:
    chain = _exception_chain(exc)
    if any(isinstance(item, SSLError) for item in chain):
        return False

    for item in chain:
        status = getattr(item, "code", None)
        if not isinstance(status, int):
            status = getattr(item, "status_code", None)
        if not isinstance(status, int):
            status = getattr(getattr(item, "response", None), "status_code", None)
        if status in _SIA_RETRYABLE_STATUS_CODES:
            return True

    return any(
        isinstance(item, (RequestConnectionError, RequestTimeout, ChunkedEncodingError))
        for item in chain
    )


def _run_query_sia_with_retries(
    collection: str,
    ra: float,
    dec: float,
    radius_deg: float,
    deadline_at: float,
) -> list[dict[str, Any]]:
    last_error: BaseException | None = None
    attempts = 0

    while attempts < _SIA_MAX_ATTEMPTS:
        if time.monotonic() >= deadline_at:
            break
        attempts += 1
        try:
            return _run_query_sia(collection, ra, dec, radius_deg)
        except Exception as exc:
            if not _is_transient_sia_error(exc):
                raise
            last_error = exc
            if attempts >= _SIA_MAX_ATTEMPTS:
                break

            delay = min(
                _SIA_RETRY_BASE_DELAY_S * (2 ** (attempts - 1)),
                _SIA_RETRY_MAX_DELAY_S,
            )
            if deadline_at - time.monotonic() <= delay:
                break
            time.sleep(delay)

    if last_error is None:
        raise SIAUnavailableError("IRSA SIA is temporarily unavailable: the query deadline expired.")
    raise SIAUnavailableError(
        f"IRSA SIA is temporarily unavailable after {attempts} attempt(s)."
    ) from last_error


def _forget_sia_request(
    key: tuple[str, float, float, float],
    completed: Future[list[dict[str, Any]]],
) -> None:
    with _SIA_IN_FLIGHT_LOCK:
        if _SIA_IN_FLIGHT.get(key) is completed:
            del _SIA_IN_FLIGHT[key]


def _run_query_sia(collection: str, ra: float, dec: float, radius_deg: float) -> list[dict[str, Any]]:
    """Blocking astroquery SIA2 call. Never call directly — use query_sia."""
    from astropy import units as u
    from astropy.coordinates import SkyCoord
    from astroquery.ipac.irsa import Irsa

    coord = SkyCoord(ra, dec, unit="deg", frame="icrs")
    table = Irsa.query_sia(pos=(coord, radius_deg * u.deg), collection=collection)
    if table is None or len(table) == 0:
        return []
    return [normalize_row({c: row[c] for c in table.colnames}, collection) for row in table]


def query_sia(
    collection: str,
    ra: float,
    dec: float,
    radius_deg: float,
    timeout_s: float | None = None,
) -> list[dict[str, Any]]:
    """Live SIA2 query via astroquery, bounded by an explicit deadline.

    The SIA transport (astroquery -> pyvo -> requests) sets no timeout of its
    own: without this wrapper a stalled IRSA response would block the caller
    indefinitely. Transient retries run sequentially in the same worker and
    share one overall deadline. On expiry a timeout error is raised; no
    partial result is ever returned as complete.
    """
    if collection not in KNOWN_COLLECTIONS:
        raise ValueError(f"Unknown collection {collection!r}. Known: {sorted(KNOWN_COLLECTIONS)}")
    deadline = config.SIA_TIMEOUT_S if timeout_s is None else float(timeout_s)
    if not deadline > 0:
        raise ValueError(f"SIA timeout must be positive, got {timeout_s!r}.")
    deadline_at = time.monotonic() + deadline
    key = (collection, float(ra), float(dec), float(radius_deg))
    with _SIA_IN_FLIGHT_LOCK:
        future = _SIA_IN_FLIGHT.get(key)
        if future is None:
            future = _SIA_EXECUTOR.submit(
                _run_query_sia_with_retries,
                collection,
                ra,
                dec,
                radius_deg,
                deadline_at,
            )
            _SIA_IN_FLIGHT[key] = future
            future.add_done_callback(lambda completed: _forget_sia_request(key, completed))
    try:
        return future.result(timeout=max(0.0, deadline_at - time.monotonic()))
    except SIAUnavailableError:
        raise
    except FuturesTimeoutError as exc:
        raise SIAUnavailableError(
            f"IRSA SIA is temporarily unavailable: the query did not complete within {deadline:g} s; "
            "the upstream IRSA SIA service stalled. Try again later."
        ) from exc
