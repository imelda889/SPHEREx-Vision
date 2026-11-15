"""Deterministic M2C tests: job validation, positive/negative detection,
coordinate conversion, mask/edge handling, quality flags, API responses.

All arrays are synthetic test fixtures. They validate CODE behaviour only;
scientific validation is done separately on a real DR1 pair.
"""
from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits
from fastapi.testclient import TestClient

from app import candidates, compare, config
from app.main import app
from .test_compare import RA0, DEC0, make_cutout, make_wcs, rec

client = TestClient(app)


def _isolated(tmp_path, monkeypatch):
    cmp_dir = tmp_path / "compare"
    cand_dir = tmp_path / "candidates"
    cmp_dir.mkdir()
    cand_dir.mkdir()
    monkeypatch.setattr(config, "COMPARE_DIR", cmp_dir)
    monkeypatch.setattr(config, "CANDIDATE_DIR", cand_dir)
    return cmp_dir, cand_dir


def _cutout_with_bump(shape=(20, 20), base=1.0, variance=0.01, bump=None, flags=None, **kw):
    """Build a cutout payload; bump = (row, col, amplitude, sigma)."""
    ny, nx = shape
    img = np.full(shape, float(base), dtype=np.float64)
    if bump is not None:
        r0, c0, amp, sig = bump
        yy, xx = np.indices(shape)
        img += float(amp) * np.exp(-((xx - c0) ** 2 + (yy - r0) ** 2) / (2 * sig ** 2))
    flg = np.zeros(shape, dtype=np.int32) if flags is None else np.asarray(flags, dtype=np.int32)
    w = kw.pop("wcs", None) or make_wcs()
    header = w.to_header()
    header["BUNIT"] = "MJy / sr"
    header["CRPIX1A"] = 0.0
    header["CRPIX2A"] = 0.0
    var = np.full(shape, float(variance), dtype=np.float32)
    zod = np.full(shape, 0.2, dtype=np.float32)
    hdus = [
        fits.PrimaryHDU(),
        fits.ImageHDU(data=img.astype(np.float32), header=header, name="IMAGE"),
        fits.ImageHDU(data=flg, header=header, name="FLAGS"),
        fits.ImageHDU(data=var, header=header, name="VARIANCE"),
        fits.ImageHDU(data=zod, header=header, name="ZODI"),
    ]
    buf = io.BytesIO()
    fits.HDUList(hdus).writeto(buf)
    return buf.getvalue()


def _run_job(monkeypatch, early_payload, late_payload, threshold=5.0, min_area=5):
    monkeypatch.setattr(
        compare, "fetch_cutout", lambda url, ra, dec, size: {"A": early_payload, "B": late_payload}[url[-1]]
    )
    a = rec("A", 3, 60000.0, url="https://irsa.ipac.caltech.edu/A")
    b = rec("B", 3, 60010.0, url="https://irsa.ipac.caltech.edu/B")
    result = compare.run_comparison(a, b, RA0, DEC0, 0.2, "spherex_dr1")
    det = candidates.run_detection(result["job_id"], threshold_sigma=threshold, min_area=min_area)
    return result, det


# ---------------------------------------------------------------- validation


def test_invalid_job_rejected(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    with pytest.raises(candidates.CandidateError) as exc:
        candidates.run_detection("does-not-exist")
    assert exc.value.code == "invalid_job"
    assert exc.value.status == 404


def test_missing_numerical_data_rejected(tmp_path, monkeypatch):
    cmp_dir, _ = _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump()
    late = _cutout_with_bump()
    result, _ = _run_job(monkeypatch, early, late)
    (cmp_dir / result["job_id"] / "arrays.npz").unlink()
    with pytest.raises(candidates.CandidateError) as exc:
        candidates.run_detection(result["job_id"])
    assert exc.value.code == "incomplete_job"


def test_missing_wcs_rejected(tmp_path, monkeypatch):
    cmp_dir, _ = _isolated(tmp_path, monkeypatch)
    result, _ = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    prod_path = cmp_dir / result["job_id"] / "products.json"
    prod = json.loads(prod_path.read_text(encoding="utf-8"))
    prod["wcs_header"] = {}
    prod_path.write_text(json.dumps(prod), encoding="utf-8")
    with pytest.raises(candidates.CandidateError) as exc:
        candidates.run_detection(result["job_id"])
    assert exc.value.code == "missing_wcs"


def test_invalid_mask_rejected(tmp_path, monkeypatch):
    cmp_dir, _ = _isolated(tmp_path, monkeypatch)
    result, _ = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    arr_path = cmp_dir / result["job_id"] / "arrays.npz"
    z = dict(np.load(arr_path, allow_pickle=False))
    z["valid"] = np.zeros((4, 4), dtype=bool)  # wrong shape
    with open(arr_path, "wb") as fh:
        np.savez_compressed(fh, **z)
    with pytest.raises(candidates.CandidateError) as exc:
        candidates.run_detection(result["job_id"])
    assert exc.value.code in ("incomplete_job", "invalid_mask")


def test_bad_params_rejected(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    result, _ = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    with pytest.raises(candidates.CandidateError) as exc:
        candidates.run_detection(result["job_id"], threshold_sigma=1.0)
    assert exc.value.code == "bad_params"
    with pytest.raises(candidates.CandidateError) as exc2:
        candidates.run_detection(result["job_id"], min_area=1000)
    assert exc2.value.code == "bad_params"


# ---------------------------------------------------------------- detection


def test_positive_residual_detection(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump()
    late = _cutout_with_bump(bump=(10, 10, 2.0, 1.2))
    _, det = _run_job(monkeypatch, early, late)
    assert det["counts"]["positive"] >= 1
    assert det["counts"]["negative"] == 0
    pos = [c for c in det["candidates"] if c["sign"] == "positive"]
    assert pos and pos[0]["peak_diff"] > 0
    assert pos[0]["peak_stat"] > 5.0
    assert pos[0]["unit"] == "MJy / sr"
    assert pos[0]["obs_earlier"] == "A" and pos[0]["obs_later"] == "B"


def test_negative_residual_detection(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump(bump=(10, 10, 2.0, 1.2))
    late = _cutout_with_bump()
    _, det = _run_job(monkeypatch, early, late)
    assert det["counts"]["negative"] >= 1
    assert det["counts"]["positive"] == 0
    neg = [c for c in det["candidates"] if c["sign"] == "negative"]
    assert neg and neg[0]["peak_diff"] < 0
    assert neg[0]["peak_stat"] < -5.0


def test_coordinate_conversion_matches_wcs(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    w = make_wcs()
    early = _cutout_with_bump(wcs=w)
    late = _cutout_with_bump(bump=(12, 8, 2.0, 1.2), wcs=w)
    _, det = _run_job(monkeypatch, early, late)
    cand = [c for c in det["candidates"] if c["sign"] == "positive"][0]
    assert cand["ra_deg"] is not None and cand["dec_deg"] is not None
    sky = w.pixel_to_world(8.0, 12.0)
    assert abs(cand["ra_deg"] - float(sky.ra.deg)) < 0.005
    assert abs(cand["dec_deg"] - float(sky.dec.deg)) < 0.005
    assert cand["x_pix"] is not None and abs(cand["x_pix"] - 8.0) < 2.0
    assert cand["y_pix"] is not None and abs(cand["y_pix"] - 12.0) < 2.0


def test_masked_pixels_excluded(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    flags = np.zeros((20, 20), dtype=np.int32)
    flags[7:14, 7:14] = 1 << 0  # TRANSIENT bit masks the bump region
    early = _cutout_with_bump()
    late = _cutout_with_bump(bump=(10, 10, 2.0, 1.2), flags=flags)
    _, det = _run_job(monkeypatch, early, late)
    assert det["counts"]["total"] == 0
    assert det["candidates"] == []


def test_edge_artefact_rejected(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump()
    late = _cutout_with_bump(bump=(0, 0, 4.0, 1.5))
    _, det = _run_job(monkeypatch, early, late)
    assert det["counts"]["rejected_edge"] >= 1
    assert all(
        (c["x_pix"] is None or c["x_pix"] > 1.0) for c in det["candidates"]
    )


def test_zero_candidates_honest(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    _, det = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    assert det["counts"] == {
        "positive": 0,
        "negative": 0,
        "total": 0,
        "rejected_edge": 0,
        "n_valid_pixels": det["counts"]["n_valid_pixels"],
    }
    assert det["candidates"] == []


def test_quality_flags_generated(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump()
    late = _cutout_with_bump(bump=(10, 10, 2.0, 1.2))
    _, det = _run_job(monkeypatch, early, late)
    cand = [c for c in det["candidates"] if c["sign"] == "positive"][0]
    assert "correlated_noise" in cand["quality_flags"]
    assert isinstance(cand["npix"], int) and cand["npix"] >= 5
    assert cand["boundary_dist_pix"] is not None and cand["boundary_dist_pix"] > 3.0


def test_detection_result_cached(tmp_path, monkeypatch):
    _, cand_dir = _isolated(tmp_path, monkeypatch)
    _, det = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    cached = candidates.read_cached(det["job_id"])
    assert cached["counts"]["total"] == 0
    assert (cand_dir / det["job_id"] / "detection.json").exists()


# ---------------------------------------------------------------- API


def test_api_detect_and_result_roundtrip(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    early = _cutout_with_bump()
    late = _cutout_with_bump(bump=(10, 10, 2.0, 1.2))
    monkeypatch.setattr(
        compare, "fetch_cutout", lambda url, ra, dec, size: {"A": early, "B": late}[url[-1]]
    )
    a = rec("A", 3, 60000.0, url="https://irsa.ipac.caltech.edu/A")
    b = rec("B", 3, 60010.0, url="https://irsa.ipac.caltech.edu/B")
    job = compare.run_comparison(a, b, RA0, DEC0, 0.2, "spherex_dr1")["job_id"]

    r = client.post(
        "/api/candidates/detect",
        json={"job_id": job, "threshold_sigma": 5.0, "min_area": 5, "deblend": True},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["compare_job_id"] == job
    assert body["counts"]["positive"] >= 1

    g = client.get(f"/api/candidates/{job}")
    assert g.status_code == 200
    assert g.json()["counts"]["total"] == body["counts"]["total"]

    f = client.get(f"/api/candidates/{job}/file/detection.json")
    assert f.status_code == 200

    jobs = client.get("/api/compare/jobs")
    assert jobs.status_code == 200
    entry = next(j for j in jobs.json()["jobs"] if j["job_id"] == job)
    assert entry["has_products"] is True
    assert entry["has_detection"] is True


def test_api_invalid_job_404(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    r = client.post("/api/candidates/detect", json={"job_id": "no-such-job"})
    assert r.status_code == 404
    g = client.get("/api/candidates/no-such-job")
    assert g.status_code == 404


def test_api_rejects_bad_params(tmp_path, monkeypatch):
    _isolated(tmp_path, monkeypatch)
    _, det = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    r = client.post("/api/candidates/detect", json={"job_id": det["job_id"], "threshold_sigma": 1.0})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "bad_params"


def test_api_old_job_without_products_rejected(tmp_path, monkeypatch):
    cmp_dir, _ = _isolated(tmp_path, monkeypatch)
    _, det = _run_job(monkeypatch, _cutout_with_bump(), _cutout_with_bump())
    (cmp_dir / det["job_id"] / "arrays.npz").unlink()
    (config.CANDIDATE_DIR / det["job_id"] / "detection.json").unlink()
    r = client.post("/api/candidates/detect", json={"job_id": det["job_id"]})
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "incomplete_job"
