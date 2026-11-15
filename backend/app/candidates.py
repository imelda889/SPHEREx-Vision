"""M2C: evidence-based candidate residual detection on real M2B products.

Consumes ONLY the numerical products written by ``app.compare.run_comparison``
(``arrays.npz`` + ``products.json``). Display PNGs are never touched.

Method (documented for the validation report):
- Primary array is the ZODI-subtracted difference when available, else raw.
- Robust background: sigma-clipped median/RMS over valid pixels
  (``astropy.stats.sigma_clipped_stats``, fallback to median/MAD).
- Per-pixel effective noise: ``sqrt(noise_map^2 + background_rms^2)`` where the
  noise map is the propagated ``sqrt(var_a + var_b)`` from M2B. This keeps one
  threshold in sigma units meaningful when the noise varies across the image.
- Detection statistic per pixel: ``(diff - background) / sigma_eff``.
  This is a DIAGNOSTIC statistic, never a calibrated probability.
- Segmentation: ``photutils.segmentation.detect_sources`` on the positive and
  (negated) negative statistic maps separately, with ``mask=~valid``,
  configurable threshold and minimum connected area, followed by
  ``deblend_sources`` where supported. Falls back to the raw segmentation if
  deblending fails.
- Reproection and convolution correlate neighbouring pixels, so the statistic
  map violates pixel independence. The threshold is therefore conservative
  (default 5 sigma) and every candidate carries a ``correlated_noise`` flag.

Nothing here invents observations, fluxes or discoveries. A candidate residual
is not a discovery and requires further validation.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from astropy.stats import sigma_clipped_stats
from astropy.time import Time
from astropy.wcs import WCS

from . import compare, config

log = logging.getLogger(__name__)

DETECTION_VERSION = "m2c-1"

DEFAULT_THRESHOLD_SIGMA = float(5.0)
DEFAULT_MIN_AREA = int(5)
MIN_THRESHOLD_SIGMA = 3.0
MAX_THRESHOLD_SIGMA = 10.0
MIN_AREA_LO = 3
MIN_AREA_HI = 100

BOUNDARY_FLAG_PIX = 3.0
LOW_COVERAGE_FRACTION = 0.8


class CandidateError(ValueError):
    """Raised when a detection job cannot run defensibly."""

    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _sanitise_job_id(job_id: str) -> str:
    job = (job_id or "").strip()
    if not job or "/" in job or "\\" in job or ".." in job:
        raise CandidateError("invalid_job", f"Unknown comparison job {job_id!r}.", status=404)
    if len(job) > 64:
        raise CandidateError("invalid_job", f"Unknown comparison job {job_id!r}.", status=404)
    return job


def _read_json(path: Path, what: str) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise CandidateError(
            "incomplete_job",
            f"Comparison job is missing {what}; regenerate it with the current pipeline.",
            status=422,
        ) from None
    except (OSError, ValueError) as exc:
        raise CandidateError("incomplete_job", f"Comparison job {what} is unreadable: {exc}") from exc


def load_job(job_id: str) -> dict[str, Any]:
    """Load and validate every numerical input detection needs."""
    job = _sanitise_job_id(job_id)
    job_dir = config.COMPARE_DIR / job
    if not job_dir.is_dir():
        raise CandidateError("invalid_job", f"Unknown comparison job {job!r}.", status=404)
    meta = _read_json(job_dir / "meta.json", "meta.json")
    products = _read_json(job_dir / "products.json", "products.json")
    arrays_path = job_dir / "arrays.npz"
    if not arrays_path.exists():
        raise CandidateError(
            "incomplete_job",
            "This comparison predates numerical products (arrays.npz). "
            "Rerun the comparison to regenerate it; detection never uses PNG pixels.",
            status=422,
        )

    try:
        arrays = np.load(arrays_path, allow_pickle=False)
        diff = np.asarray(arrays["diff_primary"], dtype=np.float64)
        noise = np.asarray(arrays["noise"], dtype=np.float64)
        valid = np.asarray(arrays["valid"], dtype=bool)
    except (OSError, KeyError, ValueError) as exc:
        raise CandidateError("incomplete_job", f"Numerical products are unreadable: {exc}") from exc

    shape = products.get("shape") or []
    if len(shape) != 2 or list(diff.shape) != [int(shape[0]), int(shape[1])]:
        raise CandidateError("incomplete_job", "Numerical products have an inconsistent shape.")
    if diff.shape != noise.shape or diff.shape != valid.shape:
        raise CandidateError("incomplete_job", "Numerical products have mismatched array shapes.")
    if valid.dtype != np.dtype(bool):
        try:
            valid = valid.astype(bool)
        except ValueError as exc:
            raise CandidateError("invalid_mask", f"Validity mask is not boolean: {exc}") from exc
    if not np.isfinite(diff[valid]).any() and valid.any():
        raise CandidateError("incomplete_job", "No finite difference values on valid pixels.")

    wcs_header = products.get("wcs_header")
    if not isinstance(wcs_header, dict) or not wcs_header:
        raise CandidateError("missing_wcs", "Comparison products carry no WCS header.")
    try:
        from astropy.io.fits import Header

        wcs = WCS(Header(wcs_header))
    except Exception as exc:  # noqa: BLE001
        raise CandidateError("missing_wcs", f"Stored WCS header is unusable: {exc}") from exc
    if not getattr(wcs, "has_celestial", False):
        raise CandidateError("missing_wcs", "Stored WCS has no celestial axes.")

    obs = meta.get("observations") if isinstance(meta.get("observations"), dict) else None
    if not obs or not isinstance(obs.get("earlier"), dict) or not isinstance(obs.get("later"), dict):
        raise CandidateError("incomplete_job", "Comparison metadata has no observation pair.")
    earlier, later = obs["earlier"], obs["later"]
    if not earlier.get("obs_id") or not later.get("obs_id"):
        raise CandidateError("incomplete_job", "Comparison metadata is missing observation IDs.")

    return {
        "job_id": job,
        "job_dir": job_dir,
        "meta": meta,
        "products": products,
        "diff": diff,
        "noise": noise,
        "valid": valid,
        "wcs": wcs,
    }


def robust_background(diff: np.ndarray, valid: np.ndarray) -> dict[str, Any]:
    """Sigma-clipped background over valid, finite pixels (fallback: MAD)."""
    v = np.asarray(diff[valid], dtype=np.float64)
    v = v[np.isfinite(v)]
    if v.size == 0:
        return {"median": None, "rms": None, "method": "no valid pixels", "n": 0}
    try:
        mean, median, std = sigma_clipped_stats(v, sigma=3.0, maxiters=5)
        median_f, std_f = float(median), float(std)
        if not np.isfinite(median_f) or not np.isfinite(std_f) or std_f < 0:
            raise ValueError("degenerate sigma-clipped stats")
        return {"median": median_f, "rms": std_f, "method": "sigma-clipped (3.0 sigma, 5 iters)", "n": int(v.size)}
    except Exception:  # noqa: BLE001
        median_f = float(np.median(v))
        mad = float(np.median(np.abs(v - median_f)))
        rms = float(1.4826 * mad)
        if not np.isfinite(rms) or rms < 0:
            rms = float(np.std(v)) if np.isfinite(np.std(v)) else float("nan")
        # A perfectly flat field has RMS exactly zero; callers fall back to
        # the propagated per-pixel noise map in that case.
        return {"median": median_f, "rms": rms, "method": "median/MAD fallback", "n": int(v.size)}


def _centroid_from_weights(weights: np.ndarray, pix: np.ndarray) -> tuple[float | None, float | None, str | None]:
    """Intensity-weighted centroid; falls back to unweighted mean."""
    ys, xs = np.where(pix)
    if ys.size == 0:
        return None, None, "no contributing pixels"
    w = np.asarray(weights, dtype=np.float64).ravel()
    w = np.where(np.isfinite(w), w, 0.0)
    w = np.clip(w, 0.0, None)
    total = float(w.sum())
    if total > 0 and np.isfinite(total):
        x = float((xs * w).sum() / total)
        y = float((ys * w).sum() / total)
        return x, y, None
    return float(xs.mean()), float(ys.mean()), "unweighted fallback (non-positive weights)"


def _try_source_catalog_centroid(
    data_pos: np.ndarray, segm_data: np.ndarray, label: int, mask: np.ndarray
) -> tuple[float | None, float | None]:
    """Use photutils.SourceCatalog for the centroid when possible."""
    try:
        from photutils.segmentation import SourceCatalog

        single = np.where(segm_data == label, segm_data, 0)
        cat = SourceCatalog(data_pos, single, mask=mask)
        if len(cat) == 0:
            return None, None
        x = float(cat[0].xcentroid.value) if hasattr(cat[0].xcentroid, "value") else float(cat[0].xcentroid)
        y = float(cat[0].ycentroid.value) if hasattr(cat[0].ycentroid, "value") else float(cat[0].ycentroid)
        if np.isfinite(x) and np.isfinite(y):
            return x, y
        return None, None
    except Exception:  # noqa: BLE001
        return None, None


def _segment_detections(
    stat_map: np.ndarray,
    valid: np.ndarray,
    threshold_sigma: float,
    min_area: int,
    deblend: bool,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Run photutils detection on one signed statistic map (positive values)."""
    from photutils.segmentation import deblend_sources, detect_sources

    data = np.where(valid & np.isfinite(stat_map), np.clip(stat_map, 0.0, None), 0.0)
    mask = ~valid
    segm = detect_sources(data, threshold=threshold_sigma, n_pixels=min_area, mask=mask)
    info: dict[str, Any] = {"n_raw": 0, "deblended": False, "note": ""}
    if segm is None:
        return np.zeros_like(valid, dtype=np.int32), info
    info["n_raw"] = int(segm.n_labels)
    if deblend and segm.n_labels > 0:
        try:
            debl = deblend_sources(data, segm, n_pixels=min_area, mask=mask, n_levels=32, contrast=0.001)
            info["deblended"] = True
            info["n_raw"] = int(debl.n_labels)
            return np.asarray(debl.data, dtype=np.int32), info
        except Exception as exc:  # noqa: BLE001
            info["note"] = f"deblending unavailable, kept raw segmentation: {exc}"
            return np.asarray(segm.data, dtype=np.int32), info
    return np.asarray(segm.data, dtype=np.int32), info


def _measure_candidates(
    segm_data: np.ndarray,
    sign: str,
    diff: np.ndarray,
    stat: np.ndarray,
    noise: np.ndarray,
    valid: np.ndarray,
    wcs: WCS,
    background: dict[str, Any],
    meta: dict[str, Any],
    products: dict[str, Any],
    job_id: str,
    prefix: str,
) -> tuple[list[dict[str, Any]], int, int]:
    from scipy.ndimage import binary_dilation

    ny, nx = diff.shape
    bkg = background.get("median")
    bkg_rms = background.get("rms")
    labels = sorted(int(v) for v in np.unique(segm_data) if int(v) != 0)
    psf = (meta.get("psf") or {}) if isinstance(meta.get("psf"), dict) else {}
    psf_status = str(psf.get("status", "unknown"))
    try:
        psf_resid = float(psf.get("residual_sigma_fraction", float("nan")))
    except (TypeError, ValueError):
        psf_resid = float("nan")
    psf_bad = psf_status != "matched" or (np.isfinite(psf_resid) and psf_resid > 0.05)

    obs = meta.get("observations", {})
    earlier, later = obs.get("earlier", {}), obs.get("later", {})
    unit = products.get("unit") or meta.get("observations", {}).get("earlier", {}).get("unit")

    rows: list[dict[str, Any]] = []
    rejected_edge = 0
    # Pre-sort labels by peak statistic so IDs are deterministic.
    scored: list[tuple[float, int]] = []
    for label in labels:
        pix = (segm_data == label) & valid
        if not pix.any():
            continue
        ys, xs = np.where(pix)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == ny - 1 or xs.max() == nx - 1:
            rejected_edge += 1
            continue
        seg_stat = stat[pix]
        seg_stat = seg_stat[np.isfinite(seg_stat)]
        if seg_stat.size == 0:
            continue
        peak = float(seg_stat.max()) if sign == "positive" else float(seg_stat.min())
        scored.append((-abs(peak), label) if sign == "positive" else (abs(peak), label))
    scored.sort()
    ordered = [label for _, label in scored]

    for seq, label in enumerate(ordered, start=1):
        pix = (segm_data == label) & valid
        npix = int(pix.sum())
        ys, xs = np.where(pix)
        seg_diff = diff[pix]
        seg_stat = stat[pix]
        finite = np.isfinite(seg_diff) & np.isfinite(seg_stat)
        if finite.sum() == 0:
            continue
        if sign == "positive":
            peak_diff = float(np.max(seg_diff[np.isfinite(seg_diff)]))
            peak_stat = float(np.max(seg_stat[np.isfinite(seg_stat)]))
            weights = seg_diff - (bkg if bkg is not None else 0.0)
        else:
            peak_diff = float(np.min(seg_diff[np.isfinite(seg_diff)]))
            peak_stat = float(np.min(seg_stat[np.isfinite(seg_stat)]))
            weights = -1.0 * (seg_diff - (bkg if bkg is not None else 0.0))

        # Non-negative weights for the centroid: residual strength per sign.
        wpos = np.clip(weights, 0.0, None)
        wimg = np.zeros_like(diff, dtype=np.float64)
        wimg[pix] = np.where(np.isfinite(wpos), wpos, 0.0)
        cat_data = np.where(valid, wimg, 0.0)
        cx, cy = _try_source_catalog_centroid(cat_data, segm_data, label, ~valid)
        coord_reason: str | None = None
        if cx is None or cy is None:
            cx, cy, fallback_note = _centroid_from_weights(wpos, pix)
            coord_reason = None if (cx is not None and fallback_note is None) else fallback_note

        ra_deg: float | None = None
        dec_deg: float | None = None
        if cx is not None and cy is not None and np.isfinite(cx) and np.isfinite(cy):
            try:
                sky = wcs.pixel_to_world(float(cx), float(cy))
                ra_deg = float(sky.ra.deg)
                dec_deg = float(sky.dec.deg)
            except Exception as exc:  # noqa: BLE001
                coord_reason = f"WCS conversion failed: {exc}"
        else:
            coord_reason = fallback_note or "centroid unavailable"

        if bkg is not None and np.isfinite(bkg):
            flux_sum: float | None = float(np.sum(seg_diff[np.isfinite(seg_diff)] - float(bkg)))
            flux_reason = None
        else:
            flux_sum, flux_reason = None, "background unavailable"
        if flux_sum is not None and not np.isfinite(flux_sum):
            flux_sum, flux_reason = None, "non-finite integrated sum"

        seg_noise = noise[pix]
        seg_noise = seg_noise[np.isfinite(seg_noise)]
        noise_local = float(np.median(seg_noise)) if seg_noise.size else None

        if cx is not None and cy is not None:
            boundary_dist = float(min(float(cx), float(cy), float(nx - 1 - cx), float(ny - 1 - cy)))
        else:
            boundary_dist = None

        dilated = binary_dilation(pix, iterations=1)
        touches_masked = bool((dilated & ~valid).any())
        # Local coverage inside the segment bounding box.
        y0, y1 = int(ys.min()), int(ys.max()) + 1
        x0, x1 = int(xs.min()), int(xs.max()) + 1
        box = valid[y0:y1, x0:x1]
        coverage = float(box.mean()) if box.size else 0.0

        flags: list[str] = []
        if boundary_dist is not None and boundary_dist < BOUNDARY_FLAG_PIX:
            flags.append("near_boundary")
        if touches_masked:
            flags.append("touches_masked")
        if coverage < LOW_COVERAGE_FRACTION:
            flags.append("low_coverage")
        if bkg is not None and bkg_rms is not None and np.isfinite(bkg) and np.isfinite(bkg_rms):
            if abs(float(bkg)) > 0.5 * abs(float(bkg_rms)):
                flags.append("background_sensitive")
        if psf_bad:
            flags.append("psf_mismatch")
        flags.append("correlated_noise")
        if npix <= DEFAULT_MIN_AREA + 1 or abs(peak_stat) > 50.0:
            flags.append("possible_artefact")

        rows.append(
            {
                "id": f"{prefix}{seq:04d}",
                "sign": sign,
                "x_pix": float(cx) if cx is not None else None,
                "y_pix": float(cy) if cy is not None else None,
                "ra_deg": ra_deg,
                "dec_deg": dec_deg,
                "coord_null_reason": coord_reason,
                "peak_diff": peak_diff,
                "peak_stat": peak_stat,
                "detection_statistic": peak_stat,
                "flux_sum": flux_sum,
                "flux_null_reason": flux_reason,
                "background": float(bkg) if bkg is not None and np.isfinite(bkg) else None,
                "background_rms": float(bkg_rms) if bkg_rms is not None and np.isfinite(bkg_rms) else None,
                "noise_local": noise_local,
                "npix": npix,
                "boundary_dist_pix": boundary_dist,
                "local_coverage": coverage,
                "quality_flags": flags,
                "unit": unit,
                "obs_earlier": earlier.get("obs_id"),
                "obs_later": later.get("obs_id"),
                "band": earlier.get("band"),
                "detector": earlier.get("detector"),
                "mjd_earlier": earlier.get("t_min_mjd"),
                "mjd_later": later.get("t_min_mjd"),
                "date_earlier": earlier.get("obs_date_utc"),
                "date_later": later.get("obs_date_utc"),
                "compare_job_id": job_id,
            }
        )
    rejected_small = 0
    return rows, rejected_edge, rejected_small


def run_detection(
    job_id: str,
    threshold_sigma: float = DEFAULT_THRESHOLD_SIGMA,
    min_area: int = DEFAULT_MIN_AREA,
    deblend: bool = True,
) -> dict[str, Any]:
    """Run positive/negative residual detection for one comparison job."""
    if not (MIN_THRESHOLD_SIGMA <= float(threshold_sigma) <= MAX_THRESHOLD_SIGMA):
        raise CandidateError(
            "bad_params",
            f"threshold_sigma must be within [{MIN_THRESHOLD_SIGMA}, {MAX_THRESHOLD_SIGMA}].",
        )
    if not (MIN_AREA_LO <= int(min_area) <= MIN_AREA_HI):
        raise CandidateError("bad_params", f"min_area must be within [{MIN_AREA_LO}, {MIN_AREA_HI}].")
    bundle = load_job(job_id)
    meta, products = bundle["meta"], bundle["products"]
    diff = bundle["diff"]
    noise_in = bundle["noise"]
    valid_in = bundle["valid"]
    wcs = bundle["wcs"]
    job = bundle["job_id"]

    finite = valid_in & np.isfinite(diff) & np.isfinite(noise_in) & (noise_in > 0)
    background = robust_background(diff, finite)
    bkg = background.get("median")
    bkg_rms = background.get("rms")
    if bkg is None or bkg_rms is None or not np.isfinite(float(bkg)) or not np.isfinite(float(bkg_rms)):
        raise CandidateError("unreliable_background", "Robust background estimation failed on valid pixels.")
    if float(bkg_rms) < 0.0:
        raise CandidateError("unreliable_background", "Robust background estimation failed on valid pixels.")
    # A perfectly flat field (e.g. synthetic fixtures, never real sky) has RMS
    # zero; sigma_eff then falls back to the propagated per-pixel noise map.

    sigma_eff = np.sqrt(np.maximum(noise_in, 0.0) ** 2 + float(bkg_rms) ** 2)
    with np.errstate(divide="ignore", invalid="ignore"):
        stat = np.where(finite, (diff - float(bkg)) / sigma_eff, np.nan)

    pos_segm, pos_info = _segment_detections(stat, finite, float(threshold_sigma), int(min_area), bool(deblend))
    neg_segm, neg_info = _segment_detections(-stat, finite, float(threshold_sigma), int(min_area), bool(deblend))

    positives, rej_edge_pos, _ = _measure_candidates(
        pos_segm, "positive", diff, stat, noise_in, finite, wcs,
        background, meta, products, job, "P",
    )
    negatives, rej_edge_neg, _ = _measure_candidates(
        neg_segm, "negative", diff, stat, noise_in, finite, wcs,
        background, meta, products, job, "N",
    )
    candidates = positives + negatives
    candidates.sort(key=lambda r: abs(float(r["peak_stat"])), reverse=True)

    result = {
        "job_id": job,
        "compare_job_id": job,
        "detection_version": DETECTION_VERSION,
        "products_version": products.get("products_version"),
        "pipeline_version": compare.PIPELINE_VERSION,
        "parameters": {
            "threshold_sigma": float(threshold_sigma),
            "min_area": int(min_area),
            "deblend": bool(deblend),
            "difference_source": products.get("difference_source"),
            "unit": products.get("unit"),
            "shape": products.get("shape"),
        },
        "method": {
            "background": background,
            "noise": "per-pixel sqrt(var_a + var_b) combined in quadrature with background RMS",
            "statistic": "(diff - background) / sigma_eff; diagnostic only, not a probability",
            "segmentation": "photutils.segmentation.detect_sources + deblend_sources, positive and negative maps separately",
            "mask": "M2B valid mask (FLAGS except FULLSAMPLE/SOURCE, reprojection footprint, non-finite, variance)",
            "edge_policy": "segments touching the outer image border are removed and counted",
            "correlated_noise": "reprojection and convolution correlate neighbours; threshold is conservative and flagged",
        },
        "counts": {
            "positive": len(positives),
            "negative": len(negatives),
            "total": len(candidates),
            "rejected_edge": int(rej_edge_pos + rej_edge_neg),
            "n_valid_pixels": int(finite.sum()),
        },
        "segmentation_info": {"positive": pos_info, "negative": neg_info},
        "candidates": candidates,
        "provenance": {
            "observations": meta.get("observations"),
            "region": meta.get("region"),
            "epoch_separation_days": meta.get("epoch_separation_days"),
            "psf": meta.get("psf"),
            "masks": meta.get("masks"),
            "difference_convention": (meta.get("difference") or {}).get("convention"),
            "compare_warnings": meta.get("warnings", []),
            "images": meta.get("images", {}),
        },
        "warnings": [
            "Candidate residuals are not discoveries and require further validation.",
            "A positive residual means later > earlier; a negative residual means later < earlier. Neither implies a moving object.",
            "The detection statistic is diagnostic only, not a calibrated probability.",
            "Undersampled PSF, correlated noise from reprojection/convolution, and ZODI model error can all mimic residuals.",
        ],
        "generated_utc": Time.now().isot,
    }

    out_dir = config.CANDIDATE_DIR / job
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "detection.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    log.info("candidates %s: +%d/-%d (thr=%.1f, area>=%d)", job, len(positives), len(negatives), threshold_sigma, min_area)
    return result


def read_cached(job_id: str) -> dict[str, Any]:
    """Return the cached detection result, or raise a 404 with guidance."""
    job = _sanitise_job_id(job_id)
    # Validate the comparison job first so unknown jobs 404 clearly.
    load_job(job)
    path = config.CANDIDATE_DIR / job / "detection.json"
    if not path.exists():
        raise CandidateError(
            "not_detected",
            "No candidate detection has been run for this comparison job yet.",
            status=404,
        )
    return _read_json(path, "detection.json")
