"""Tests for the defensive MEF inspector.

Synthetic in-memory MEFs test parser LOGIC ONLY (named-HDU resolution,
validation, error paths) — they are not astronomical data and never leave
the test process.
"""
import io

import pytest
from astropy.io import fits


def _make_mef(order, with_image=True, psf_kind="EPSF"):
    """Build a synthetic MEF with HDUs in the given name order."""
    hdul = fits.HDUList([fits.PrimaryHDU()])
    import numpy as np

    def img_hdu(name):
        h = fits.ImageHDU(data=np.zeros((8, 8), dtype="float32"), name=name)
        if name == "IMAGE":
            h.header["BUNIT"] = "MJy/sr"
            h.header["CRPIX1"] = 4.0
            h.header["CRPIX2"] = 4.0
            h.header["CRVAL1"] = 133.786245
            h.header["CRVAL2"] = -7.244372
            h.header["CTYPE1"] = "RA---TAN"
            h.header["CTYPE2"] = "DEC--TAN"
            h.header["CDELT1"] = -0.001
            h.header["CDELT2"] = 0.001
        return h

    names = [n for n in order if not (n == "IMAGE" and not with_image)]
    if psf_kind is None:
        names = [n for n in names if n not in ("EPSF", "PSF")]
    for n in names:
        if n in ("EPSF", "PSF"):
            hdul.append(fits.ImageHDU(data=np.zeros((4, 4), dtype="float32"), name=n))
        elif n == "WCS-WAVE":
            hdul.append(fits.BinTableHDU(data=np.zeros(1, dtype=[("X", "f8"), ("Y", "f8")]), name=n))
        else:
            hdul.append(img_hdu(n))
    buf = io.BytesIO()
    hdul.writeto(buf)
    buf.seek(0)
    return buf


def test_inspect_ok_regardless_of_order():
    from app.fitsmeta import inspect_mef

    buf = _make_mef(["WCS-WAVE", "FLAGS", "VARIANCE", "IMAGE", "ZODI", "EPSF"])
    meta = inspect_mef(buf, filename_hint="synthetic_order.fits")
    assert meta["present_hdus"] == ["PRIMARY", "WCS-WAVE", "FLAGS", "VARIANCE", "IMAGE", "ZODI", "EPSF"]
    assert meta["warnings"] == []
    assert meta["shape"] == [8, 8]
    assert meta["unit"] == "MJy/sr"


def test_missing_image_raises_with_names():
    from app.fitsmeta import MefError, inspect_mef

    buf = _make_mef(["FLAGS", "VARIANCE"], with_image=False)
    with pytest.raises(MefError, match="IMAGE"):
        inspect_mef(buf, filename_hint="synthetic_noimage.fits")


def test_obsid_detector_from_real_filename():
    from app.fitsmeta import _detector_from_filename, _obs_id_from_filename

    # Exact filename pattern seen in live IRSA responses (DR1, 2026-11-13).
    name = "level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits"
    assert _obs_id_from_filename(name) == "2025W19_1B_0116_1"
    assert _detector_from_filename(name) == 3
    assert _obs_id_from_filename("other.fits") is None
    assert _detector_from_filename("other.fits") is None


def test_psf_variant_accepted():
    from app.fitsmeta import inspect_mef

    meta = inspect_mef(_make_mef(["IMAGE", "FLAGS", "VARIANCE", "ZODI", "PSF"]), filename_hint="x.fits")
    assert meta["psf_kind"] == "PSF"


def test_missing_psf_warns_not_fails():
    from app.fitsmeta import inspect_mef

    meta = inspect_mef(
        _make_mef(["IMAGE", "FLAGS", "VARIANCE", "ZODI"], psf_kind=None), filename_hint="x.fits"
    )
    assert meta["psf_kind"] is None
    assert any("EPSF" in w for w in meta["warnings"])


def test_primary_only_fails():
    from app.fitsmeta import MefError, inspect_mef

    buf = io.BytesIO()
    fits.HDUList([fits.PrimaryHDU()]).writeto(buf)
    buf.seek(0)
    with pytest.raises(MefError):
        inspect_mef(buf, filename_hint="primary_only.fits")
