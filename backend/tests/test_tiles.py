"""Tests for cutout URLs, PNG rendering, and WCS round-trips.

Synthetic headers exercise the math; the real-header round-trip uses a
header saved from a genuine IRSA cutout (tests/fixtures/real_wcs.json,
written by the live verification step — real data, not mock).
"""
import io
import json
from pathlib import Path

import pytest
from astropy.io import fits


def _synthetic_tan_header():
    return {
        "CRPIX1": 50.0, "CRPIX2": 50.0,
        "CRVAL1": 133.786245, "CRVAL2": -7.244372,
        "CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN",
        "CDELT1": -0.001, "CDELT2": 0.001,
    }


def test_build_cutout_url():
    from app.tiles import build_cutout_url

    url = build_cutout_url("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2_abc.fits", 133.786245, -7.244372, 0.2)
    assert url == "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2_abc.fits?center=133.786245,-7.244372&size=0.2"
    with pytest.raises(ValueError):
        build_cutout_url("ftp://irsa.ipac.caltech.edu/y.fits", 10.0, 0.0, 0.2)
    with pytest.raises(ValueError):
        build_cutout_url("https://evil.example.com/y.fits", 10.0, 0.0, 0.2)
    with pytest.raises(ValueError):
        build_cutout_url("https://irsa.ipac.caltech.edu/y.fits", 10.0, 0.0, 0.0)


def test_render_png_from_synthetic_image():
    import numpy as np

    from app.tiles import render_png

    rng = np.random.default_rng(7)
    buf = io.BytesIO()
    fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(data=(rng.normal(10, 2, size=(64, 48))).astype("float32"), name="IMAGE"),
    ]).writeto(buf)
    png, stats = render_png(buf.getvalue(), max_dim=32)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    assert stats["rendered_shape"][0] <= 32 and stats["rendered_shape"][1] <= 32


def test_round_trip_synthetic_wcs():
    from app.tiles import pixel_to_sky, sky_to_pixel

    hdr = _synthetic_tan_header()
    for x, y in [(10.0, 10.0), (49.5, 49.5), (90.0, 5.0)]:
        ra, dec = pixel_to_sky(hdr, x, y)
        x2, y2 = sky_to_pixel(hdr, ra, dec)
        assert abs(x2 - x) < 1e-6 and abs(y2 - y) < 1e-6


# Extracted 2026-11-13 from a live IRSA cutout of
# level2_2025W19_1B_0116_1D3 (RA 133.786245, Dec -7.244372, size 0.2deg).
# Real calibration-independent header values — not mock data.
REAL_WCS = Path(__file__).parent / "fixtures" / "real_wcs.json"


@pytest.mark.skipif(not REAL_WCS.exists(), reason="real header fixture written by live verification")
def test_round_trip_real_cutout_wcs():
    from astropy.io import fits

    from app.tiles import pixel_to_sky, sky_to_pixel

    hdr = dict(fits.Header(json.loads(REAL_WCS.read_text(encoding="utf-8"))))
    for x, y in [(10.0, 10.0), (100.0, 60.0)]:
        ra, dec = pixel_to_sky(hdr, x, y)
        assert 130.0 < ra < 136.0 and -9.0 < dec < -6.0  # sanity: near test field
        x2, y2 = sky_to_pixel(hdr, ra, dec)
        assert abs(x2 - x) < 1e-6 and abs(y2 - y) < 1e-6
