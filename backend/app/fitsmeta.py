"""Defensive SPHEREx Spectral Image MEF inspection.

The tutorial accesses the primary HDU at index 0 and the six extensions at
indices 1-6. This module never assumes that layout: it resolves every HDU
BY NAME, validates presence, and raises meaningful errors instead of
silently reading the wrong data.

Required data extensions: IMAGE, FLAGS, VARIANCE, ZODI.
PSF extension: EPSF (DR1/QR3) or PSF (QR2) — either is accepted.
Optional: WCS-WAVE (visualization-grade spectral lookup).
"""
from __future__ import annotations

import logging
from typing import Any, BinaryIO

log = logging.getLogger(__name__)

REQUIRED_HDS = ("IMAGE", "FLAGS", "VARIANCE", "ZODI")
PSF_HDU_NAMES = ("EPSF", "PSF")


class MefError(ValueError):
    """Raised when a file is not a usable SPHEREx Spectral Image MEF."""


def _hdu_names(hdulist: Any) -> list[str]:
    names: list[str] = []
    for hdu in hdulist:
        name = (hdu.name or "").upper()
        names.append(name if name else f"UNNAMED@{len(names)}")
    return names


def _find_hdu(hdulist: Any, name: str) -> Any | None:
    for hdu in hdulist:
        if (hdu.name or "").upper() == name:
            return hdu
    return None


def inspect_mef(source: str | BinaryIO, filename_hint: str = "") -> dict[str, Any]:
    """Inspect a Spectral Image MEF and extract metadata + spatial WCS.

    Returns a JSON-serializable dict with: filename, obs_id, detector,
    present_hdus, warnings, shape, bunit, pixel_scale_arcsec (when derivable),
    center_ra_dec (via spatial WCS at image centre), and the WCS header cards
    needed for later round-trip tests.
    """
    from astropy.io import fits

    with fits.open(source) as hdul:
        names = _hdu_names(hdul)
        log.info("MEF HDUs for %s: %s", filename_hint or "<?>", names)

        present = {n for n in names if not n.startswith("UNNAMED@")}
        missing = [h for h in REQUIRED_HDS if h not in present]
        if "IMAGE" in missing:
            raise MefError(
                "Not a usable SPHEREx Spectral Image MEF: required HDU 'IMAGE' not found "
                f"(found: {names}). Refusing to guess by index."
            )
        warnings: list[str] = []
        for h in missing:
            warnings.append(f"Required HDU {h!r} missing; continuing without it.")
            log.warning("MEF %s missing HDU %s", filename_hint or "<?>", h)

        psf_hdu = _find_hdu(hdul, "EPSF") or _find_hdu(hdul, "PSF")
        psf_kind = psf_hdu.name.upper() if psf_hdu is not None else None
        if psf_kind is None:
            warnings.append("Neither EPSF nor PSF extension present; PSF-dependent steps must be skipped.")

        image_hdu = _find_hdu(hdul, "IMAGE")
        assert image_hdu is not None  # validated above
        data_shape = list(image_hdu.data.shape) if image_hdu.data is not None else []
        header = image_hdu.header
        wcs_cards = {
            k: header[k]
            for k in ("CRPIX1", "CRPIX2", "CRVAL1", "CRVAL2", "CTYPE1", "CTYPE2",
                      "CDELT1", "CDELT2", "CD1_1", "CD1_2", "CD2_1", "CD2_2")
            if k in header
        }

        center_ra_dec: list[float] | None = None
        pixel_scale_arcsec: float | None = None
        try:
            from astropy.wcs import WCS

            wcs = WCS(header)
            ny, nx = int(image_hdu.data.shape[0]), int(image_hdu.data.shape[1])
            ra_c, dec_c = wcs.pixel_to_world_values(nx / 2.0, ny / 2.0)
            center_ra_dec = [float(ra_c), float(dec_c)]
            pixel_scale_arcsec = float(abs(wcs.proj_plane_pixel_scales()[0].value) * 3600.0)
        except Exception as exc:  # WCS problems must not crash inspection
            warnings.append(f"Spatial WCS unreadable ({exc}); coordinates unavailable.")
            log.warning("WCS failed for %s: %s", filename_hint or "<?>", exc)

        return {
            "filename": filename_hint,
            "obs_id": _obs_id_from_filename(filename_hint),
            "detector": _detector_from_filename(filename_hint),
            "present_hdus": names,
            "psf_kind": psf_kind,
            "warnings": warnings,
            "shape": data_shape,
            "unit": str(header.get("BUNIT", "")),
            "pixel_scale_arcsec": pixel_scale_arcsec,
            "center_ra_dec": center_ra_dec,
            "wcs_cards": {k: (float(v) if isinstance(v, (int, float)) else str(v)) for k, v in wcs_cards.items()},
        }


def _split_obsid_detector(name: str) -> tuple[str | None, int | None]:
    """Split 'level2_2025W19_1B_0116_1D3_spx_l2b-...fits' into
    ('2025W19_1B_0116_1', 3). The detector digit directly follows the small
    slew counter with no separator: <obsid>D<det>_spx_."""
    import re

    base = name.rsplit("/", 1)[-1]
    m = re.search(r"^(?:level2_)?(.+?)D([1-6])_spx_", base)
    if not m:
        return None, None
    return m.group(1) or None, int(m.group(2))


def _obs_id_from_filename(name: str) -> str | None:
    """level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits -> 2025W19_1B_0116_1."""
    return _split_obsid_detector(name)[0]


def _detector_from_filename(name: str) -> int | None:
    """..._1D3_spx_... -> 3. Returns None (never raises) when unparseable."""
    return _split_obsid_detector(name)[1]
