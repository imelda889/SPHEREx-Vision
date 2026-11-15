"""M2B: real temporal image comparison for SPHEREx DR1 spectral images.

Pipeline (every step documented in the returned provenance):

1. Resolve both observations server-side from live SIA2 metadata.
2. Validate the pair: same band, same collection, genuinely different epochs.
3. Fetch IRSA cutouts and parse HDUs BY NAME (never by index).
4. Build a validity mask from the official FLAGS bit table. The SOURCE bit is
   NOT a defect and is never masked.
5. Reproject the later epoch onto the earlier epoch's pixel grid, carrying a
   footprint/validity mask. Invalid pixels are never interpolated as valid.
6. Match the effective PSF by convolving the sharper epoch with a
   pixel-integrated Gaussian; the target is the broader measured ePSF.
7. Subtract with an explicit convention: difference = later - earlier.
8. Propagate variance and masks. The significance-like map is a DIAGNOSTIC
   statistic only, never a calibrated detection probability.

Nothing here invents observations, dates, fluxes, or detections.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image

from . import config, tiles

log = logging.getLogger(__name__)

PIPELINE_VERSION = "m2b-1"
# M2C numerical products are versioned separately so the deterministic job id
# (which is part of the M2B contract) stays stable.
PRODUCTS_VERSION = "m2c-1"

# Official SPHEREx Level-2 flag bits (IRSA SPHEREx Data Explorer flag table).
# name -> (bit, masks_pixel)
FLAG_BITS: dict[str, tuple[int, bool]] = {
    "TRANSIENT": (0, True),
    "OVERFLOW": (1, True),
    "SUR_ERROR": (2, True),
    "NONFUNC": (6, True),
    "DICHROIC": (7, True),
    "MISSING_DATA": (9, True),
    "HOT": (10, True),
    "COLD": (11, True),
    "FULLSAMPLE": (12, False),  # benign: full sample history available
    "PHANMISS": (14, True),
    "NONLINEAR": (15, True),
    "PERSIST": (17, True),
    "OUTLIER": (19, True),
    "CROSSTALK": (20, True),
    "SOURCE": (21, False),  # benign: a real source is present here
    "GHOST": (22, True),
    "GHOST_FPA": (23, True),
    "STREAK": (25, True),
    "BLOOM": (26, True),
    "SNOWBALL": (27, True),
    "HALO": (28, True),
    "SATELLITE_HALO": (29, True),
}
BENIGN_MASK = sum(1 << bit for _, (bit, masks) in FLAG_BITS.items() if not masks)
MASKING_BITS = sum(1 << bit for _, (bit, masks) in FLAG_BITS.items() if masks)

REQUIRED_HDU_NAMES = ("IMAGE", "FLAGS", "VARIANCE")
OPTIONAL_HDU_NAMES = ("ZODI",)
PSF_HDU_NAMES = ("EPSF", "PSF")

DIFF_CONVENTION = "difference = later_epoch - earlier_epoch"


class CompareError(ValueError):
    """Raised when a pair cannot be compared defensibly."""

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


# --------------------------------------------------------------------------
# FITS parsing (HDU names, never indices)
# --------------------------------------------------------------------------


def _hdu_by_name(hdul: Any, name: str) -> Any | None:
    want = name.upper()
    for hdu in hdul:
        if (hdu.name or "").upper() == want:
            return hdu
    return None


def _rebin_oversampled(stamp: np.ndarray, ovx: int, ovy: int) -> np.ndarray:
    """Area-average an oversampled ePSF stamp down to native detector pixels."""
    py, px = (-stamp.shape[0]) % ovy, (-stamp.shape[1]) % ovx
    s = np.pad(stamp, ((0, py), (0, px)))
    h, w = s.shape[0] // ovy, s.shape[1] // ovx
    k = s.reshape(h, ovy, w, ovx).sum(axis=(1, 3))
    total = float(k.sum())
    if not np.isfinite(total) or total <= 0:
        raise CompareError("psf_invalid", "ePSF stamp has no positive normalisation.")
    return k / total


def kernel_sigma(k: np.ndarray) -> float:
    """Isotropic second-moment sigma of a 2-D kernel, in pixels."""
    y, x = np.indices(k.shape)
    cy, cx = (np.array(k.shape) - 1) / 2.0
    total = float(k.sum())
    if total <= 0:
        return float("nan")
    var = ((k * (x - cx) ** 2).sum() + (k * (y - cy) ** 2).sum()) / (2 * total)
    return float(np.sqrt(max(var, 0.0)))


def extract_native_psf_from_stamp(stamp: np.ndarray, oversampling: int = 5) -> dict[str, Any]:
    """Build a native-pixel PSF record from one raw oversampled ePSF stamp."""
    kernel = _rebin_oversampled(np.asarray(stamp, dtype=float), oversampling, oversampling)
    sigma = kernel_sigma(kernel)
    return {
        "status": "ok",
        "hdu": "EPSF",
        "oversampling": [oversampling, oversampling],
        "kernel_shape": [int(kernel.shape[0]), int(kernel.shape[1])],
        "kernel_sum": float(kernel.sum()),
        "kernel_min": float(kernel.min()),
        "sigma_px": sigma,
        "eq_fwhm_px": float(2.3548 * sigma),
        "kernel": kernel,
    }


def extract_native_psf(hdul: Any, crpix1a: float, crpix2a: float) -> dict[str, Any] | None:
    """Locate the ePSF zone covering this cutout and return a native-pixel kernel.

    The ePSF table is stored in ORIGINAL detector pixel coordinates and is not
    cut by the cutout service, so the cutout origin comes from CRPIX1A/CRPIX2A.
    """
    for name in PSF_HDU_NAMES:
        hdu = _hdu_by_name(hdul, name)
        if hdu is None or hdu.data is None:
            continue
        data = hdu.data
        if data.dtype.names is None:
            return {
                "status": "unsupported_format",
                "hdu": name,
                "detail": "PSF extension is not a per-zone binary table; native kernel unavailable.",
            }
        if "EPSF" not in data.dtype.names or "XCENTER" not in data.dtype.names:
            return {"status": "unsupported_format", "hdu": name, "detail": "Unrecognised PSF table columns."}
        xs = np.asarray(data["XCENTER"], dtype=float)
        ys = np.asarray(data["YCENTER"], dtype=float)
        d2 = (xs - crpix1a) ** 2 + (ys - crpix2a) ** 2
        idx = int(np.argmin(d2))
        stamp = np.asarray(data["EPSF"][idx], dtype=float)
        ovx = int(hdu.header.get("OVSMPX", 1) or 1)
        ovy = int(hdu.header.get("OVSMPY", 1) or 1)
        kernel = _rebin_oversampled(stamp, ovx, ovy)
        return {
            "status": "ok",
            "hdu": name,
            "zone_index": idx,
            "n_zones": int(len(xs)),
            "zone_center_orig_px": [float(xs[idx]), float(ys[idx])],
            "zone_distance_px": float(np.sqrt(d2[idx])),
            "oversampling": [ovx, ovy],
            "kernel_shape": [int(kernel.shape[0]), int(kernel.shape[1])],
            "kernel_sum": float(kernel.sum()),
            "kernel_min": float(kernel.min()),
            "sigma_px": kernel_sigma(kernel),
            "eq_fwhm_px": float(2.3548 * kernel_sigma(kernel)),
            "kernel": kernel,
        }
    return None


def read_cutout(payload: bytes, filename_hint: str = "") -> dict[str, Any]:
    """Parse one cutout MEF defensively, by HDU name."""
    tiles.assert_fits_magic(payload)
    warnings: list[str] = []
    missing: list[str] = []
    with fits.open(io.BytesIO(payload)) as hdul:
        names = [(h.name or "?").upper() for h in hdul]
        for req in REQUIRED_HDU_NAMES:
            if req not in names:
                missing.append(req)
        if missing:
            raise CompareError(
                "missing_hdu",
                f"Cutout {filename_hint or '<unnamed>'} is missing required HDU(s) {missing}; found {names}.",
            )
        img_hdu = _hdu_by_name(hdul, "IMAGE")
        assert img_hdu is not None
        image = np.asarray(img_hdu.data, dtype=np.float64)
        variance = np.asarray(_hdu_by_name(hdul, "VARIANCE").data, dtype=np.float64)  # type: ignore[union-attr]
        flags = np.asarray(_hdu_by_name(hdul, "FLAGS").data, dtype=np.int64)  # type: ignore[union-attr]
        zodi_hdu = _hdu_by_name(hdul, "ZODI")
        zodi = np.asarray(zodi_hdu.data, dtype=np.float64) if zodi_hdu is not None and zodi_hdu.data is not None else None

        if not (image.shape == variance.shape == flags.shape):
            raise CompareError(
                "shape_mismatch",
                f"IMAGE {image.shape}, VARIANCE {variance.shape} and FLAGS {flags.shape} do not share a shape.",
            )
        if zodi is not None and zodi.shape != image.shape:
            warnings.append(f"ZODI shape {zodi.shape} differs from IMAGE {image.shape}; ZODI ignored.")
            zodi = None

        header = img_hdu.header.copy()
        try:
            wcs = WCS(header)
        except Exception as exc:  # noqa: BLE001
            raise CompareError("invalid_wcs", f"IMAGE header has no usable WCS: {exc}") from exc
        if not wcs.has_celestial:
            raise CompareError("invalid_wcs", "IMAGE WCS has no celestial axes.")

        unit = str(header.get("BUNIT", "")).strip()
        if not unit:
            warnings.append("IMAGE BUNIT is empty; flux units are unverified.")
        elif "MJy" not in unit:
            warnings.append(f"IMAGE BUNIT is {unit!r}, not MJy/sr; unit consistency must be checked manually.")

        finite_frac = float(np.isfinite(image).mean())
        if finite_frac == 0.0:
            raise CompareError("no_finite_pixels", "IMAGE HDU contains no finite pixels.")
        if finite_frac < 1.0:
            warnings.append(f"{100 * (1 - finite_frac):.2f}% of IMAGE pixels are non-finite.")

        bad = (flags & np.int64(~BENIGN_MASK)) != 0
        flag_counts = {
            name: int(((flags & np.int64(1 << bit)) != 0).sum())
            for name, (bit, masks) in FLAG_BITS.items()
            if masks and ((flags & np.int64(1 << bit)) != 0).any()
        }

        crpix1a = header.get("CRPIX1A")
        crpix2a = header.get("CRPIX2A")
        psf: dict[str, Any] | None = None
        if crpix1a is None or crpix2a is None:
            psf = {
                "status": "unavailable",
                "detail": "CRPIX1A/CRPIX2A missing, so the cutout origin in detector pixels is unknown.",
            }
        else:
            ny, nx = image.shape
            x_orig = (nx - 1) / 2.0 - float(crpix1a)
            y_orig = (ny - 1) / 2.0 - float(crpix2a)
            psf = extract_native_psf(hdul, x_orig, y_orig)
            if psf is None:
                psf = {"status": "unavailable", "detail": "No EPSF or PSF extension in this cutout."}

        return {
            "image": image,
            "variance": variance,
            "flags": flags,
            "zodi": zodi,
            "header": header,
            "wcs": wcs,
            "unit": unit or None,
            "shape": [int(image.shape[0]), int(image.shape[1])],
            "finite_fraction": finite_frac,
            "bad_mask": bad,
            "flag_counts": flag_counts,
            "psf": psf,
            "warnings": warnings,
            "hdu_names": names,
        }


# --------------------------------------------------------------------------
# Pair validation
# --------------------------------------------------------------------------


@dataclass
class PairCheck:
    ok: bool
    dt_days: float | None = None
    problems: list[str] = field(default_factory=list)


def validate_pair(a: dict[str, Any], b: dict[str, Any], min_sep_days: float) -> PairCheck:
    problems: list[str] = []
    if a.get("obs_id") == b.get("obs_id"):
        problems.append("Both selections resolve to the same observation.")
    if a.get("band") is None or b.get("band") is None:
        problems.append("One or both observations have no band metadata.")
    elif a["band"] != b["band"]:
        problems.append(f"Bands differ (D{a['band']} vs D{b['band']}); temporal comparison requires one band.")
    if a.get("collection") != b.get("collection"):
        problems.append("Observations come from different collections.")
    ta, tb = a.get("t_min_mjd"), b.get("t_min_mjd")
    dt = None
    if ta is None or tb is None:
        problems.append("Observation times are missing, so the epochs cannot be verified.")
    else:
        dt = abs(float(tb) - float(ta))
        if dt < min_sep_days:
            problems.append(
                f"Epoch separation {dt:.4f} d is below the {min_sep_days} d minimum; "
                "this looks like a dither inside one visit, not a separate epoch."
            )
    if not a.get("access_url") or not b.get("access_url"):
        problems.append("One or both observations have no usable FITS access URL.")
    return PairCheck(ok=not problems, dt_days=dt, problems=problems)


# --------------------------------------------------------------------------
# Alignment / reprojection
# --------------------------------------------------------------------------


def _as_float_flags(flags: np.ndarray) -> np.ndarray:
    return flags.astype(np.float64)


def reproject_to_reference(src: dict[str, Any], ref_wcs: WCS, shape: tuple[int, int]) -> dict[str, Any]:
    """Reproject one epoch onto the reference pixel grid, keeping a validity mask."""
    from reproject import reproject_interp

    image, fp = reproject_interp((src["image"], src["wcs"]), ref_wcs, shape_out=shape, order="bilinear")
    variance, _ = reproject_interp((src["variance"], src["wcs"]), ref_wcs, shape_out=shape, order="bilinear")
    zodi = None
    if src["zodi"] is not None:
        zodi, _ = reproject_interp((src["zodi"], src["wcs"]), ref_wcs, shape_out=shape, order="bilinear")
    flags, _ = reproject_interp(
        (_as_float_flags(src["flags"]), src["wcs"]), ref_wcs, shape_out=shape, order="nearest-neighbor"
    )
    flags_i = np.nan_to_num(flags, nan=float(1 << 9)).astype(np.int64)
    covered = np.isfinite(fp) & (fp > 0)
    return {
        "image": image,
        "variance": variance,
        "zodi": zodi,
        "flags": flags_i,
        "covered": covered,
        "footprint_fraction": float(covered.mean()),
    }


def gauss_kernel_integrated(sigma: float, half: int = 2) -> np.ndarray:
    """Pixel-area-integrated circular Gaussian (not sampled at pixel centres).

    Sampling a sigma < 0.5 px Gaussian at pixel centres degenerates to a delta
    function; integrating over pixel areas keeps the discrete kernel meaningful.
    """
    from scipy.special import erf

    n = 2 * half + 1
    c = half
    s2 = sigma * np.sqrt(2.0)
    k = np.zeros((n, n), dtype=np.float64)
    for i in range(n):
        for j in range(n):
            fx = 0.5 * (erf((j - c + 0.5) / s2) - erf((j - c - 0.5) / s2))
            fy = 0.5 * (erf((i - c + 0.5) / s2) - erf((i - c - 0.5) / s2))
            k[i, j] = fx * fy
    total = float(k.sum())
    if total <= 0:
        raise CompareError("psf_kernel_invalid", "PSF matching kernel has no positive normalisation.")
    return k / total


def convolve_image(arr: np.ndarray, kernel: np.ndarray, bad: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Convolve, propagating the mask conservatively (any bad input -> bad output)."""
    from astropy.convolution import convolve_fft

    filled = np.where(bad | ~np.isfinite(arr), 0.0, arr)
    out = convolve_fft(filled, kernel, boundary="fill", fill_value=0.0, normalize_kernel=False, nan_treatment="fill")
    bad_out = convolve_fft(
        bad.astype(np.float64), kernel, boundary="fill", fill_value=0.0, normalize_kernel=False, nan_treatment="fill"
    ) > 1e-9
    return out, bad_out


def propagate_variance(variance: np.ndarray, kernel: np.ndarray, bad: np.ndarray) -> np.ndarray:
    """Var(sum k_i x_i) = sum k_i^2 Var(x_i) for independent pixels."""
    from astropy.convolution import convolve_fft

    filled = np.where(bad | ~np.isfinite(variance), 0.0, variance)
    return convolve_fft(
        filled, kernel ** 2, boundary="fill", fill_value=0.0, normalize_kernel=False, nan_treatment="fill"
    )


def match_psfs(
    psf_a: dict[str, Any] | None, psf_b: dict[str, Any] | None
) -> dict[str, Any]:
    """Decide whether PSF matching is needed and return the matching kernels."""
    meta: dict[str, Any] = {
        "status": "unavailable",
        "policy": "target = broader measured ePSF; the sharper epoch is convolved, never deconvolved.",
        "match_a": False,
        "match_b": False,
        "kernel_a": None,
        "kernel_b": None,
    }
    if not psf_a or not psf_b or psf_a.get("status") != "ok" or psf_b.get("status") != "ok":
        meta["detail"] = "ePSF is missing or unsupported for at least one epoch; no PSF matching applied."
        return meta

    sa = float(psf_a["sigma_px"])
    sb = float(psf_b["sigma_px"])
    meta.update({"sigma_a_px": sa, "sigma_b_px": sb, "ratio": max(sa, sb) / max(min(sa, sb), 1e-12)})
    if not np.isfinite(sa) or not np.isfinite(sb) or sa <= 0 or sb <= 0:
        meta["detail"] = "Measured ePSF second moments are not finite; no matching applied."
        return meta
    if meta["ratio"] < 1.02:
        meta.update({"status": "identical", "detail": "Measured ePSFs agree within 2%; no convolution applied."})
        return meta

    sigma_match = float(np.sqrt(abs(sa ** 2 - sb ** 2)))
    kernel = gauss_kernel_integrated(sigma_match)
    meta["matching_sigma_px"] = sigma_match
    meta["matching_kernel_shape"] = [int(kernel.shape[0]), int(kernel.shape[1])]
    meta["matching_kernel_sum"] = float(kernel.sum())
    meta["matching_kernel_min"] = float(kernel.min())
    if kernel.min() < 0:
        meta.update({"status": "rejected", "detail": "Matching kernel has negative weights; refusing to apply."})
        return meta

    # Validate the effective PSF: convolve the sharper ePSF with the kernel.
    from astropy.convolution import convolve_fft

    sharper = psf_b if sb < sa else psf_a
    target = psf_a if sb < sa else psf_b
    k_src = np.asarray(sharper["kernel"], dtype=float)
    pad = 31
    padded = np.zeros((pad, pad))
    o = (pad - k_src.shape[0]) // 2
    padded[o : o + k_src.shape[0], o : o + k_src.shape[1]] = k_src
    eff = convolve_fft(padded, kernel, boundary="fill", fill_value=0.0, normalize_kernel=False)
    eff /= eff.sum()
    sigma_eff = kernel_sigma(eff)
    target_sigma = float(target["sigma_px"])
    residual = abs(sigma_eff - target_sigma) / target_sigma
    meta.update(
        {
            "status": "matched" if residual <= 0.10 else "unvalidated",
            "target": "A" if target is psf_a else "B",
            "sigma_after_px": sigma_eff,
            "residual_sigma_fraction": residual,
            "detail": (
                "Sharper epoch convolved with a pixel-integrated Gaussian; "
                f"effective sigma changed from {min(sa, sb):.4f} to {sigma_eff:.4f} px "
                f"(target {target_sigma:.4f} px, residual {100 * residual:.2f}%)."
            ),
        }
    )
    if target is psf_a:
        meta["match_b"] = True
        meta["kernel_b"] = kernel
    else:
        meta["match_a"] = True
        meta["kernel_a"] = kernel
    return meta


# --------------------------------------------------------------------------
# Difference and rendering
# --------------------------------------------------------------------------


def _robust_sigma(values: np.ndarray) -> float:
    if values.size == 0:
        return float("nan")
    med = float(np.median(values))
    return float(1.4826 * np.median(np.abs(values - med)))


def compute_difference(
    img_a: np.ndarray,
    var_a: np.ndarray,
    valid_a: np.ndarray,
    img_b: np.ndarray,
    var_b: np.ndarray,
    valid_b: np.ndarray,
    zodi_a: np.ndarray | None,
    zodi_b: np.ndarray | None,
) -> dict[str, Any]:
    valid = valid_a & valid_b & np.isfinite(img_a) & np.isfinite(img_b)
    diff_raw = img_b - img_a
    diff_zodi = None
    if zodi_a is not None and zodi_b is not None:
        diff_zodi = (img_b - zodi_b) - (img_a - zodi_a)
    noise = np.sqrt(np.maximum(var_a, 0) + np.maximum(var_b, 0))

    def stats(arr: np.ndarray | None) -> dict[str, Any] | None:
        if arr is None:
            return None
        v = arr[valid]
        if v.size == 0:
            return None
        return {
            "n_pixels": int(v.size),
            "median": float(np.median(v)),
            "mean": float(np.mean(v)),
            "std": float(np.std(v)),
            "robust_sigma": _robust_sigma(v),
            "min": float(np.min(v)),
            "max": float(np.max(v)),
        }

    sig = None
    if diff_zodi is not None:
        with np.errstate(divide="ignore", invalid="ignore"):
            sig = np.where(valid & (noise > 0), diff_zodi / noise, np.nan)
    sv = sig[valid] if sig is not None else np.array([])
    sig_stats = None
    if sv.size:
        sig_stats = {
            "label": "diagnostic statistic only — not a calibrated detection probability",
            "std": float(np.nanstd(sv)),
            "robust_sigma": _robust_sigma(sv),
            "p999": float(np.nanpercentile(sv, 99.9)),
            "max": float(np.nanmax(sv)),
            "min": float(np.nanmin(sv)),
            "note": (
                "The robust sigma describes the bulk noise. The plain std and the percentiles are "
                "dominated by real sources and residual PSF mismatch, not by a detection threshold."
            ),
        }

    bg = {
        "a_median": float(np.median(img_a[valid])) if valid.any() else None,
        "b_median": float(np.median(img_b[valid])) if valid.any() else None,
        "zodi_a_median": float(np.median(zodi_a[valid])) if zodi_a is not None and valid.any() else None,
        "zodi_b_median": float(np.median(zodi_b[valid])) if zodi_b is not None and valid.any() else None,
    }
    if bg["a_median"] is not None and bg["b_median"] is not None:
        bg["delta_median"] = bg["b_median"] - bg["a_median"]
    if bg.get("zodi_a_median") is not None and bg.get("zodi_b_median") is not None:
        bg["delta_zodi"] = bg["zodi_b_median"] - bg["zodi_a_median"]

    return {
        "valid": valid,
        "valid_fraction": float(valid.mean()),
        "diff_raw": diff_raw,
        "diff_zodi": diff_zodi,
        "noise": noise,
        "significance": sig,
        "stats_raw": stats(diff_raw),
        "stats_zodi": stats(diff_zodi),
        "significance_stats": sig_stats,
        "background": bg,
        "noise_median": float(np.median(noise[valid])) if valid.any() else None,
    }


def _display_limits(arr: np.ndarray, valid: np.ndarray, lo_pct: float = 0.5, hi_pct: float = 99.5) -> tuple[float, float]:
    v = arr[valid]
    if v.size == 0:
        return 0.0, 1.0
    lo, hi = float(np.percentile(v, lo_pct)), float(np.percentile(v, hi_pct))
    if not hi > lo:
        hi = lo + 1.0
    return lo, hi


def render_gray_png(arr: np.ndarray, valid: np.ndarray, lo: float, hi: float) -> bytes:
    scaled = np.clip((arr - lo) / (hi - lo), 0.0, 1.0)
    scaled = np.where(valid & np.isfinite(arr), scaled, np.nan)
    rgb = np.zeros((*arr.shape, 3), dtype=np.uint8)
    gray = (scaled * 255.0)
    for c in range(3):
        rgb[..., c] = np.nan_to_num(gray, nan=0.0).astype(np.uint8)
    rgb[~valid | ~np.isfinite(arr)] = (28, 36, 48)
    buf = io.BytesIO()
    Image.fromarray(rgb, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()


def render_diverging_png(arr: np.ndarray, valid: np.ndarray, vmin: float, vmax: float) -> bytes:
    span = max(vmax - vmin, 1e-12)
    t = np.clip((arr - vmin) / span, 0.0, 1.0)
    # blue (negative) -> near-black (zero) -> red (positive)
    neg = np.array([70, 130, 230], dtype=float)
    mid = np.array([12, 16, 24], dtype=float)
    pos = np.array([240, 92, 92], dtype=float)
    rgb = np.zeros((*arr.shape, 3), dtype=float)
    lo_mask = t < 0.5
    hi_mask = ~lo_mask
    f_lo = (t / 0.5)[..., None]
    f_hi = ((t - 0.5) / 0.5)[..., None]
    rgb[lo_mask] = (mid + (neg - mid) * f_lo)[lo_mask]
    rgb[hi_mask] = (mid + (pos - mid) * f_hi)[hi_mask]
    out = np.clip(np.nan_to_num(rgb, nan=0.0), 0, 255).astype(np.uint8)
    out[~valid | ~np.isfinite(arr)] = (28, 36, 48)
    buf = io.BytesIO()
    Image.fromarray(out, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()


# --------------------------------------------------------------------------
# Job assembly
# --------------------------------------------------------------------------


def _jsonable(value: Any) -> Any:
    """Convert numpy scalars/arrays in WCS headers to plain JSON types."""
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, (np.generic,)):
        return value.item()
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    return value


def wcs_header_dict(wcs: WCS) -> dict[str, Any]:
    """Serialise the reference WCS header to plain JSON types."""
    try:
        header = wcs.to_header(relax=True)
    except Exception:  # noqa: BLE001
        header = wcs.to_header()
    return {str(k): _jsonable(v) for k, v in dict(header).items()}


def job_id_for(collection: str, ra: float, dec: float, size_deg: float, obs_a: str, obs_b: str) -> str:
    seed = f"{PIPELINE_VERSION}|{collection}|{ra:.6f}|{dec:.6f}|{size_deg:.6f}|{obs_a}|{obs_b}".encode()
    return hashlib.sha256(seed).hexdigest()[:16]


def _cutout_cache_path(access_url: str, ra: float, dec: float, size_deg: float) -> str:
    seed = f"{access_url}|{ra:.6f}|{dec:.6f}|{size_deg:.6f}".encode()
    return hashlib.sha256(seed).hexdigest()[:20]


def fetch_cutout(access_url: str, ra: float, dec: float, size_deg: float) -> bytes:
    cache = config.CACHE_DIR / "cutouts"
    cache.mkdir(parents=True, exist_ok=True)
    path = cache / f"{_cutout_cache_path(access_url, ra, dec, size_deg)}.fits"
    if path.exists() and path.stat().st_size > 0:
        return path.read_bytes()
    url = tiles.build_cutout_url(access_url, ra, dec, size_deg)
    payload = tiles.fetch_bytes(url, timeout_s=config.HTTP_TIMEOUT_S, max_bytes=config.MAX_CUTOUT_BYTES)
    tiles.assert_fits_magic(payload)
    path.write_bytes(payload)
    return payload


def mjd_to_iso(mjd: float | None) -> str | None:
    if mjd is None:
        return None
    try:
        return Time(float(mjd), format="mjd", scale="utc").isot
    except Exception:  # noqa: BLE001
        return None


def _frame_meta(rec: dict[str, Any], frame: dict[str, Any], psf: dict[str, Any] | None) -> dict[str, Any]:
    psf_public = None
    if psf:
        psf_public = {k: v for k, v in psf.items() if k != "kernel"}
    return {
        "obs_id": rec.get("obs_id"),
        "collection": rec.get("collection"),
        "band": rec.get("band"),
        "detector": rec.get("detector"),
        "t_min_mjd": rec.get("t_min_mjd"),
        "t_max_mjd": rec.get("t_max_mjd"),
        "obs_date_utc": mjd_to_iso(rec.get("t_min_mjd")),
        "em_min_m": rec.get("em_min_m"),
        "em_max_m": rec.get("em_max_m"),
        "s_fov_deg": rec.get("s_fov_deg"),
        "access_format": rec.get("access_format"),
        "shape": frame["shape"],
        "unit": frame["unit"],
        "wcs_valid": True,
        "finite_fraction": frame["finite_fraction"],
        "hdu_names": frame["hdu_names"],
        "flag_counts": frame["flag_counts"],
        "psf": psf_public,
        "warnings": frame["warnings"],
    }


def run_comparison(
    rec_a: dict[str, Any],
    rec_b: dict[str, Any],
    ra: float,
    dec: float,
    size_deg: float,
    collection: str,
    min_sep_days: float | None = None,
) -> dict[str, Any]:
    """Run the full documented pipeline for one observation pair."""
    min_sep = config.MIN_EPOCH_SEPARATION_DAYS if min_sep_days is None else min_sep_days
    check = validate_pair(rec_a, rec_b, min_sep)
    if not check.ok:
        raise CompareError("invalid_pair", " ".join(check.problems), status=422)

    # The earlier epoch is always the reference grid.
    if float(rec_a["t_min_mjd"]) <= float(rec_b["t_min_mjd"]):
        early, late = rec_a, rec_b
    else:
        early, late = rec_b, rec_a

    warnings: list[str] = []
    payload_a = fetch_cutout(str(early["access_url"]), ra, dec, size_deg)
    payload_b = fetch_cutout(str(late["access_url"]), ra, dec, size_deg)
    frame_a = read_cutout(payload_a, str(early["obs_id"]))
    frame_b = read_cutout(payload_b, str(late["obs_id"]))

    if frame_a["unit"] != frame_b["unit"]:
        raise CompareError(
            "unit_mismatch",
            f"Flux units differ ({frame_a['unit']!r} vs {frame_b['unit']!r}); refusing to subtract.",
        )

    ref_wcs = frame_a["wcs"]
    shape = tuple(frame_a["image"].shape)
    b_on_a = reproject_to_reference(frame_b, ref_wcs, shape)
    if b_on_a["footprint_fraction"] < 0.05:
        raise CompareError(
            "no_overlap",
            f"Only {100 * b_on_a['footprint_fraction']:.1f}% of the reference grid is covered by the later epoch.",
        )
    if b_on_a["footprint_fraction"] < 0.99:
        warnings.append(
            f"Reprojected coverage is {100 * b_on_a['footprint_fraction']:.1f}% of the reference grid; "
            "uncovered pixels are masked, never interpolated as measurements."
        )

    bad_a = frame_a["bad_mask"] | ~np.isfinite(frame_a["image"]) | ~np.isfinite(frame_a["variance"])
    bad_b = (b_on_a["flags"] & np.int64(~BENIGN_MASK)) != 0
    bad_b |= ~np.isfinite(b_on_a["image"]) | ~np.isfinite(b_on_a["variance"]) | ~b_on_a["covered"]

    psf_meta = match_psfs(frame_a["psf"], frame_b["psf"])
    img_a = frame_a["image"].copy()
    var_a = frame_a["variance"].copy()
    img_b = b_on_a["image"].copy()
    var_b = b_on_a["variance"].copy()

    if psf_meta.get("match_a") and psf_meta.get("kernel_a") is not None:
        img_a, bad_a = convolve_image(img_a, psf_meta["kernel_a"], bad_a)
        var_a = propagate_variance(var_a, psf_meta["kernel_a"], bad_a)
    if psf_meta.get("match_b") and psf_meta.get("kernel_b") is not None:
        img_b, bad_b = convolve_image(img_b, psf_meta["kernel_b"], bad_b)
        var_b = propagate_variance(var_b, psf_meta["kernel_b"], bad_b)

    if psf_meta["status"] in ("unavailable", "rejected", "unvalidated"):
        warnings.append(
            "PSF matching was not applied or could not be validated. The difference is a raw "
            "observation difference, not a PSF-matched difference."
        )
    elif psf_meta["status"] == "matched":
        warnings.append(
            "PSF matching uses a Gaussian approximation at native (undersampled) pixel scale; "
            f"the residual effective-sigma mismatch is {100 * psf_meta['residual_sigma_fraction']:.2f}%."
        )

    diff = compute_difference(
        img_a, var_a, ~bad_a, img_b, var_b, ~bad_b, frame_a["zodi"], b_on_a["zodi"]
    )
    if diff["valid_fraction"] < 0.25:
        warnings.append(
            f"Only {100 * diff['valid_fraction']:.1f}% of pixels are valid in both epochs after masking."
        )
    if diff["diff_zodi"] is None:
        warnings.append("ZODI is missing for at least one epoch; only the raw difference is available.")

    job_id = job_id_for(collection, ra, dec, size_deg, str(early["obs_id"]), str(late["obs_id"]))
    out_dir = config.COMPARE_DIR / job_id
    out_dir.mkdir(parents=True, exist_ok=True)

    valid = diff["valid"]
    lo_a, hi_a = _display_limits(img_a, valid)
    lo_b, hi_b = _display_limits(img_b, valid)
    (out_dir / "a.png").write_bytes(render_gray_png(img_a, valid, lo_a, hi_a))
    (out_dir / "b.png").write_bytes(render_gray_png(img_b, valid, lo_b, hi_b))

    diff_limits = None
    if diff["diff_zodi"] is not None:
        sig = diff["stats_zodi"]["robust_sigma"] if diff["stats_zodi"] else 0.0
        vmax = max(4.0 * sig, 1e-12)
        (out_dir / "diff.png").write_bytes(render_diverging_png(diff["diff_zodi"], valid, -vmax, vmax))
        diff_limits = {"vmin": -vmax, "vmax": vmax, "basis": "4x robust sigma of the ZODI-subtracted difference"}
    sig_arr = diff["significance"]
    if sig_arr is not None:
        (out_dir / "sig.png").write_bytes(render_diverging_png(sig_arr, valid, -5.0, 5.0))
    if diff["diff_raw"] is not None:
        med = diff["stats_raw"]["median"] if diff["stats_raw"] else 0.0
        sig_raw = diff["stats_raw"]["robust_sigma"] if diff["stats_raw"] else 0.0
        vmax = max(4.0 * sig_raw, 1e-12)
        (out_dir / "diff_raw.png").write_bytes(render_diverging_png(diff["diff_raw"], valid, med - vmax, med + vmax))

    # M2C numerical products: persist the arrays detection must consume.
    # Display PNGs are never a substitute. Existing PNG/meta.json names are
    # unchanged; these two files are additive.
    has_zodi = diff["diff_zodi"] is not None
    primary = diff["diff_zodi"] if has_zodi else diff["diff_raw"]
    if primary is None:
        raise CompareError("no_difference", "No finite difference array could be computed for this pair.")
    difference_source = "diff_zodi" if has_zodi else "diff_raw"
    zodi_for_store = diff["diff_zodi"] if has_zodi else np.full_like(primary, np.nan)
    np.savez_compressed(
        out_dir / "arrays.npz",
        diff_primary=np.asarray(primary, dtype=np.float64),
        diff_raw=np.asarray(diff["diff_raw"], dtype=np.float64),
        diff_zodi=np.asarray(zodi_for_store, dtype=np.float64),
        noise=np.asarray(diff["noise"], dtype=np.float64),
        valid=np.asarray(valid, dtype=bool),
        var_a=np.asarray(var_a, dtype=np.float64),
        var_b=np.asarray(var_b, dtype=np.float64),
    )
    products = {
        "products_version": PRODUCTS_VERSION,
        "pipeline_version": PIPELINE_VERSION,
        "job_id": job_id,
        "difference_source": difference_source,
        "has_zodi": bool(has_zodi),
        "unit": frame_a.get("unit"),
        "shape": [int(shape[0]), int(shape[1])],
        "wcs_header": wcs_header_dict(ref_wcs),
        "valid_fraction": float(diff["valid_fraction"]),
        "note": (
            "Numerical products for evidence-based candidate detection. "
            "Detection must use diff_primary with valid and noise; never PNG pixels."
        ),
    }
    (out_dir / "products.json").write_text(json.dumps(products, indent=2), encoding="utf-8")

    result = {
        "job_id": job_id,
        "pipeline_version": PIPELINE_VERSION,
        "region": {"ra": ra, "dec": dec, "size_deg": size_deg, "collection": collection},
        "observations": {
            "earlier": _frame_meta(early, frame_a, frame_a["psf"]),
            "later": _frame_meta(late, frame_b, frame_b["psf"]),
        },
        "epoch_separation_days": check.dt_days,
        "difference": {
            "convention": DIFF_CONVENTION,
            "background": diff["background"],
            "stats_raw": diff["stats_raw"],
            "stats_zodi_subtracted": diff["stats_zodi"],
            "significance_stats": diff["significance_stats"],
            "noise_median": diff["noise_median"],
            "valid_fraction": diff["valid_fraction"],
            "display_limits": diff_limits,
        },
        "alignment": {
            "method": "reproject.reproject_interp (bilinear) for IMAGE/VARIANCE/ZODI; nearest-neighbour for FLAGS",
            "reference": f"earlier epoch {early['obs_id']} pixel grid",
            "reference_shape": [shape[0], shape[1]],
            "coverage_fraction": b_on_a["footprint_fraction"],
            "note": "Uncovered or invalid pixels are masked; they are never interpolated into valid measurements.",
        },
        "psf": {k: v for k, v in psf_meta.items() if not k.startswith("kernel")},
        "masks": {
            "policy": "A pixel is masked if any flag bit is set except FULLSAMPLE (12) and SOURCE (21).",
            "benign_bits": [12, 21],
            "masking_bits": sorted(bit for _, (bit, masks) in FLAG_BITS.items() if masks),
            "source": "IRSA SPHEREx Data Explorer flag table (SPHEREx Explanatory Supplement Table 16)",
            "valid_fraction": diff["valid_fraction"],
        },
        "warnings": warnings,
        "products": {
            "version": PRODUCTS_VERSION,
            "difference_source": difference_source,
            "files": ["arrays.npz", "products.json"],
            "arrays": ["diff_primary", "diff_raw", "diff_zodi", "noise", "valid", "var_a", "var_b"],
            "note": "Numerical difference products for candidate detection; PNGs are display only.",
        },
        "images": {
            "earlier": f"/api/compare/file/{job_id}/a.png",
            "later": f"/api/compare/file/{job_id}/b.png",
            "difference": f"/api/compare/file/{job_id}/diff.png" if diff["diff_zodi"] is not None else None,
            "difference_raw": f"/api/compare/file/{job_id}/diff_raw.png",
            "significance": f"/api/compare/file/{job_id}/sig.png" if sig_arr is not None else None,
        },
        "provenance": {
            "sia_query": {"collection": collection, "ra": ra, "dec": dec, "size_deg": size_deg},
            "cutout_size_deg": size_deg,
            "source": "IRSA SPHEREx DR1 Level-2 Spectral Image MEF via the IRSA Cutout Service",
            "hdu_resolution": "by extension name (IMAGE/FLAGS/VARIANCE/ZODI/EPSF), never by index",
            "min_epoch_separation_days": min_sep,
        },
    }
    (out_dir / "meta.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    log.info("compare job %s: %s vs %s (dt=%.3f d)", job_id, early["obs_id"], late["obs_id"], check.dt_days or 0)
    return result
