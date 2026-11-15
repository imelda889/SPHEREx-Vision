"""Backend configuration (env-overridable) and logging setup."""
from __future__ import annotations

import logging
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
CACHE_DIR = Path(os.environ.get("SPHEREX_CACHE_DIR", BASE_DIR / "cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

IRSA_SIA_URL = os.environ.get("IRSA_SIA_URL", "https://irsa.ipac.caltech.edu/SIA")
IRSA_TAP_URL = os.environ.get("IRSA_TAP_URL", "https://irsa.ipac.caltech.edu/TAP")

DEFAULT_COLLECTION = os.environ.get("SPHEREX_COLLECTION", "spherex_dr1")
HTTP_TIMEOUT_S = float(os.environ.get("SPHEREX_HTTP_TIMEOUT", "60"))
# M3C-A: deadline for one blocking IRSA SIA metadata query. The SIA path
# (astroquery -> pyvo -> requests) sets no transport timeout, so without this
# a stalled upstream response would hold a worker indefinitely.
SIA_TIMEOUT_S = float(os.environ.get("SPHEREX_SIA_TIMEOUT_S", "60"))
MAX_CUTOUT_BYTES = int(os.environ.get("SPHEREX_MAX_CUTOUT_BYTES", str(200_000_000)))
PREVIEW_MAX_DIM = int(os.environ.get("SPHEREX_PREVIEW_MAX_DIM", "1024"))
MAX_SEARCH_RADIUS_DEG = float(os.environ.get("SPHEREX_MAX_SEARCH_RADIUS_DEG", "1.0"))

# M2B temporal comparison.
COMPARE_DIR = CACHE_DIR / "compare"
COMPARE_DIR.mkdir(parents=True, exist_ok=True)
# Two exposures closer than this are treated as the same visit (dithers), not
# as separate epochs. Official dithers inside one observation are ~0.0013 d.
MIN_EPOCH_SEPARATION_DAYS = float(os.environ.get("SPHEREX_MIN_EPOCH_SEPARATION_DAYS", "0.5"))
COMPARE_SIZE_DEG = float(os.environ.get("SPHEREX_COMPARE_SIZE_DEG", "0.2"))
COMPARE_MAX_SIZE_DEG = float(os.environ.get("SPHEREX_COMPARE_MAX_SIZE_DEG", "0.5"))

# M2C candidate detection on numerical M2B products.
CANDIDATE_DIR = CACHE_DIR / "candidates"
CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
CANDIDATE_THRESHOLD_SIGMA = float(os.environ.get("SPHEREX_CANDIDATE_THRESHOLD_SIGMA", "5.0"))
CANDIDATE_MIN_AREA = int(os.environ.get("SPHEREX_CANDIDATE_MIN_AREA", "5"))

LOG_LEVEL = os.environ.get("SPHEREX_LOG_LEVEL", "INFO")


def setup_logging() -> None:
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


setup_logging()
