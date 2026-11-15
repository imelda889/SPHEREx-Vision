"""Deterministic M2B tests: pair validation, HDU parsing, alignment, masks,
variance propagation, PSF handling, difference generation, API errors.

All arrays here are synthetic test fixtures. They validate CODE behaviour only;
scientific validation is done separately on real DR1 observations.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS
from fastapi.testclient import TestClient

from app import compare, config
from app.main import app

RA0, DEC0 = 150.0, 2.0
SCALE = 0.001


def make_wcs(crpix=(10.0, 10.0), crval=(RA0, DEC0), cdelt=(-SCALE, SCALE), rot_deg=0.0) -> WCS:
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crpix = list(crpix)
    w.wcs.crval = list(crval)
    theta = np.deg2rad(rot_deg)
    cd = np.array(
        [
            [cdelt[0] * np.cos(theta), -cdelt[1] * np.sin(theta)],
            [cdelt[0] * np.sin(theta), cdelt[1] * np.cos(theta)],
        ]
    )
    w.wcs.cd = cd
    w.wcs.cunit = ["deg", "deg"]
    return w


def gauss_stamp(size: int = 33, sigma: float = 1.2) -> np.ndarray:
    y, x = np.indices((size, size))
    c = (size - 1) / 2
    k = np.exp(-((x - c) ** 2 + (y - c) ** 2) / (2 * sigma ** 2))
    return k / k.sum()


def epsf_table(sigma: float = 1.2, zones=((5.0, 5.0), (30.0, 30.0))) -> fits.BinTableHDU:
    n = len(zones)
    xc = fits.Column(name="XCENTER", format="E", array=np.array([z[0] for z in zones], dtype=np.float32))
    yc = fits.Column(name="YCENTER", format="E", array=np.array([z[1] for z in zones], dtype=np.float32))
    stamps = np.array([gauss_stamp(sigma=sigma) for _ in range(n)], dtype=np.float64)
    ep = fits.Column(name="EPSF", format="1089D", dim="(33,33)", array=stamps)
    hdu = fits.BinTableHDU.from_columns([xc, yc, ep], name="EPSF")
    hdu.header["OVSMPX"] = 5
    hdu.header["OVSMPY"] = 5
    return hdu


def make_cutout(
    shape=(20, 20),
    image_value=1.0,
    variance_value=0.01,
    flags=None,
    wcs: WCS | None = None,
    zodi_value=0.2,
    with_zodi=True,
    with_epsf=True,
    epsf_sigma=1.2,
    crpix1a=0.0,
    crpix2a=0.0,
    hdu_order=("IMAGE", "FLAGS", "VARIANCE", "ZODI", "EPSF"),
) -> bytes:
    w = wcs or make_wcs()
    header = w.to_header()
    header["BUNIT"] = "MJy / sr"
    header["CRPIX1A"] = crpix1a
    header["CRPIX2A"] = crpix2a
    ny, nx = shape
    img = np.full(shape, float(image_value), dtype=np.float32)
    var = np.full(shape, float(variance_value), dtype=np.float32)
    flg = np.zeros(shape, dtype=np.int32) if flags is None else np.asarray(flags, dtype=np.int32)
    zod = np.full(shape, float(zodi_value), dtype=np.float32)

    hdus: list[fits.hdu.base.ExtensionHDU | fits.PrimaryHDU] = [fits.PrimaryHDU()]
    for name in hdu_order:
        if name == "IMAGE":
            hdus.append(fits.ImageHDU(data=img, header=header, name="IMAGE"))
        elif name == "VARIANCE":
            hdus.append(fits.ImageHDU(data=var, header=header, name="VARIANCE"))
        elif name == "FLAGS":
            hdus.append(fits.ImageHDU(data=flg, header=header, name="FLAGS"))
        elif name == "ZODI" and with_zodi:
            hdus.append(fits.ImageHDU(data=zod, header=header, name="ZODI"))
        elif name == "EPSF" and with_epsf:
            hdus.append(epsf_table(sigma=epsf_sigma))
    buf = io.BytesIO()
    fits.HDUList(hdus).writeto(buf)
    return buf.getvalue()


def rec(obs_id="OBS_A", band=3, mjd=60000.0, collection="spherex_dr1", url="https://irsa.ipac.caltech.edu/x.fits"):
    return {
        "obs_id": obs_id,
        "band": band,
        "detector": band,
        "collection": collection,
        "t_min_mjd": mjd,
        "t_max_mjd": mjd + 0.001,
        "access_url": url,
        "access_format": "image/fits",
    }


# ---------------------------------------------------------------- pair rules


def test_validate_pair_accepts_same_band_different_epoch():
    check = compare.validate_pair(rec("A", 3, 60000.0), rec("B", 3, 60010.0), 0.5)
    assert check.ok
    assert check.dt_days == pytest.approx(10.0)


def test_validate_pair_rejects_different_band():
    check = compare.validate_pair(rec("A", 3, 60000.0), rec("B", 4, 60010.0), 0.5)
    assert not check.ok
    assert any("Bands differ" in p for p in check.problems)


def test_validate_pair_rejects_same_epoch():
    check = compare.validate_pair(rec("A", 3, 60000.0), rec("B", 3, 60000.0005), 0.5)
    assert not check.ok
    assert any("Epoch separation" in p for p in check.problems)


def test_validate_pair_rejects_same_observation():
    check = compare.validate_pair(rec("A", 3, 60000.0), rec("A", 3, 60010.0), 0.5)
    assert not check.ok
    assert any("same observation" in p for p in check.problems)


def test_validate_pair_rejects_missing_access():
    a = rec("A", 3, 60000.0)
    b = rec("B", 3, 60010.0)
    b["access_url"] = None
    check = compare.validate_pair(a, b, 0.5)
    assert not check.ok
    assert any("access URL" in p for p in check.problems)


# ---------------------------------------------------------------- FITS parsing


def test_read_cutout_resolves_hdus_by_name_not_index():
    # Deliberately shuffled extension order.
    payload = make_cutout(hdu_order=("VARIANCE", "FLAGS", "IMAGE", "EPSF", "ZODI"))
    frame = compare.read_cutout(payload)
    assert frame["shape"] == [20, 20]
    assert frame["unit"] == "MJy / sr"
    assert frame["image"].shape == frame["variance"].shape == frame["flags"].shape
    assert frame["zodi"] is not None
    assert frame["psf"]["status"] == "ok"


def test_read_cutout_missing_required_hdu_raises():
    payload = make_cutout(hdu_order=("IMAGE", "FLAGS"))  # no VARIANCE
    with pytest.raises(compare.CompareError) as exc:
        compare.read_cutout(payload)
    assert exc.value.code == "missing_hdu"


def test_read_cutout_rejects_non_fits():
    with pytest.raises(ValueError):
        compare.read_cutout(b"not a fits file at all")


def test_read_cutout_reports_psf_unavailable_without_crpix_a():
    # Build a header without CRPIX1A/CRPIX2A.
    w = make_wcs()
    header = w.to_header()
    header["BUNIT"] = "MJy / sr"
    img = np.ones((8, 8), dtype=np.float32)
    buf = io.BytesIO()
    fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(data=img, header=header, name="IMAGE"),
            fits.ImageHDU(data=np.zeros((8, 8), np.int32), header=header, name="FLAGS"),
            fits.ImageHDU(data=np.full((8, 8), 0.01, np.float32), header=header, name="VARIANCE"),
            epsf_table(),
        ]
    ).writeto(buf)
    frame = compare.read_cutout(buf.getvalue())
    assert frame["psf"]["status"] == "unavailable"


def test_flag_mask_keeps_source_and_fullsample():
    flags = np.array([[0, 1 << 21, 1 << 12, (1 << 21) | (1 << 12), 1 << 6]], dtype=np.int64)
    payload = make_cutout(shape=(1, 5), flags=flags)
    frame = compare.read_cutout(payload)
    assert list(frame["bad_mask"][0]) == [False, False, False, False, True]
    assert frame["flag_counts"].get("NONFUNC") == 1


# ---------------------------------------------------------------- alignment


def test_reproject_identity_preserves_values_and_mask():
    frame = compare.read_cutout(make_cutout(image_value=2.5, variance_value=0.04))
    out = compare.reproject_to_reference(frame, frame["wcs"], (20, 20))
    assert out["footprint_fraction"] == pytest.approx(1.0, abs=1e-6)
    assert np.allclose(out["image"], 2.5, atol=1e-6)
    assert np.allclose(out["variance"], 0.04, atol=1e-6)


def test_reproject_marks_uncovered_pixels():
    ref = compare.read_cutout(make_cutout())
    # Shift the source grid far away so most of the reference is uncovered.
    shifted = make_wcs(crval=(RA0 + 0.05, DEC0))
    src = compare.read_cutout(make_cutout(wcs=shifted, image_value=3.0))
    out = compare.reproject_to_reference(src, ref["wcs"], (20, 20))
    assert 0.0 <= out["footprint_fraction"] < 0.5
    assert np.isnan(out["image"]).any()


def test_invalid_pixels_are_not_treated_as_measurements():
    img = np.full((20, 20), 1.0)
    img[5, 5] = np.nan
    var = np.full((20, 20), 0.01)
    flags = np.zeros((20, 20), dtype=np.int64)
    flags[7, 7] = 1 << 6  # NONFUNC
    payload = make_cutout(flags=flags)
    frame = compare.read_cutout(payload)
    bad = frame["bad_mask"] | ~np.isfinite(img)
    assert bad[7, 7]
    assert bad[5, 5]
    valid = ~bad
    assert valid.sum() == 20 * 20 - 2


# ---------------------------------------------------------------- PSF


def test_gauss_kernel_is_normalised_and_non_negative():
    k = compare.gauss_kernel_integrated(0.24)
    assert k.sum() == pytest.approx(1.0, abs=1e-12)
    assert k.min() >= 0.0
    assert compare.kernel_sigma(k) > 0


def test_psf_matching_applied_when_sigmas_differ():
    a = compare.extract_native_psf_from_stamp(gauss_stamp(sigma=1.6), 5)
    b = compare.extract_native_psf_from_stamp(gauss_stamp(sigma=1.2), 5)
    meta = compare.match_psfs(a, b)
    assert meta["status"] == "matched"
    assert meta["match_b"] is True
    assert meta["match_a"] is False
    assert meta["kernel_b"].sum() == pytest.approx(1.0, abs=1e-12)
    assert meta["residual_sigma_fraction"] < 0.10


def test_psf_matching_skipped_when_sigmas_agree():
    a = compare.extract_native_psf_from_stamp(gauss_stamp(sigma=1.4), 5)
    b = compare.extract_native_psf_from_stamp(gauss_stamp(sigma=1.4), 5)
    meta = compare.match_psfs(a, b)
    assert meta["status"] == "identical"
    assert meta["match_a"] is False and meta["match_b"] is False


def test_psf_unavailable_is_reported_not_silently_skipped():
    meta = compare.match_psfs({"status": "unavailable"}, {"status": "unavailable"})
    assert meta["status"] == "unavailable"
    assert "no PSF matching applied" in meta["detail"]


# ---------------------------------------------------------------- variance


def test_variance_propagation_with_normalised_kernel_is_conservative():
    var = np.full((20, 20), 0.04)
    bad = np.zeros((20, 20), dtype=bool)
    k = compare.gauss_kernel_integrated(0.5)
    out = compare.propagate_variance(var, k, bad)
    interior = out[5:-5, 5:-5]
    # sum(k^2) < 1, so a constant variance map cannot increase.
    assert np.allclose(interior, 0.04 * float((k ** 2).sum()), rtol=1e-6)


def test_convolve_mask_dilates_bad_pixels():
    arr = np.ones((20, 20))
    bad = np.zeros((20, 20), dtype=bool)
    bad[10, 10] = True
    k = compare.gauss_kernel_integrated(0.5)
    _, bad_out = compare.convolve_image(arr, k, bad)
    assert bad_out[10, 10]
    assert bad_out[9, 10] and bad_out[11, 10] and bad_out[10, 9] and bad_out[10, 11]
    assert not bad_out[0, 0]


# ---------------------------------------------------------------- difference


def test_difference_generation_and_stats():
    a = np.full((10, 10), 1.0)
    b = np.full((10, 10), 1.5)
    var = np.full((10, 10), 0.01)
    valid = np.ones((10, 10), dtype=bool)
    diff = compare.compute_difference(a, var, valid, b, var, valid, None, None)
    assert diff["diff_raw"][0, 0] == pytest.approx(0.5)
    assert diff["stats_raw"]["median"] == pytest.approx(0.5)
    assert diff["diff_zodi"] is None
    assert diff["significance"] is None


def test_difference_zodi_subtraction_removes_foreground_offset():
    a = np.full((10, 10), 1.0)
    b = np.full((10, 10), 1.5)
    var = np.full((10, 10), 0.01)
    valid = np.ones((10, 10), dtype=bool)
    za = np.full((10, 10), 0.1)
    zb = np.full((10, 10), 0.6)
    diff = compare.compute_difference(a, var, valid, b, var, valid, za, zb)
    assert diff["stats_zodi"]["median"] == pytest.approx(0.0, abs=1e-12)
    assert diff["background"]["delta_zodi"] == pytest.approx(0.5)
    assert diff["significance_stats"]["label"].startswith("diagnostic statistic only")


def test_difference_excludes_invalid_pixels():
    a = np.full((4, 4), 1.0)
    b = np.full((4, 4), 2.0)
    var = np.full((4, 4), 0.01)
    valid_a = np.ones((4, 4), dtype=bool)
    valid_b = np.ones((4, 4), dtype=bool)
    valid_b[0, 0] = False
    diff = compare.compute_difference(a, var, valid_a, b, var, valid_b, None, None)
    assert diff["stats_raw"]["n_pixels"] == 15
    assert diff["valid_fraction"] == pytest.approx(15 / 16)


def test_render_helpers_produce_png_bytes():
    arr = np.linspace(-1, 1, 100).reshape(10, 10)
    valid = np.ones((10, 10), dtype=bool)
    assert compare.render_gray_png(arr, valid, -1, 1)[:8] == b"\x89PNG\r\n\x1a\n"
    assert compare.render_diverging_png(arr, valid, -1, 1)[:8] == b"\x89PNG\r\n\x1a\n"


# ---------------------------------------------------------------- full pipeline


@pytest.fixture()
def isolated_compare(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "COMPARE_DIR", tmp_path)
    return tmp_path


def test_run_comparison_end_to_end_with_fixtures(isolated_compare, monkeypatch):
    early = make_cutout(image_value=1.0, variance_value=0.01, epsf_sigma=1.6, zodi_value=0.10)
    late = make_cutout(image_value=1.1, variance_value=0.01, epsf_sigma=1.2, zodi_value=0.15)
    payloads = {"A": early, "B": late}
    monkeypatch.setattr(compare, "fetch_cutout", lambda url, ra, dec, size: payloads[url[-1]])

    a = rec("A", 3, 60000.0, url="https://irsa.ipac.caltech.edu/A")
    b = rec("B", 3, 60010.0, url="https://irsa.ipac.caltech.edu/B")
    result = compare.run_comparison(a, b, RA0, DEC0, 0.2, "spherex_dr1")

    assert result["epoch_separation_days"] == pytest.approx(10.0)
    assert result["observations"]["earlier"]["obs_id"] == "A"
    assert result["observations"]["later"]["obs_id"] == "B"
    assert result["psf"]["status"] == "matched"
    assert result["difference"]["stats_raw"]["median"] == pytest.approx(0.1, abs=1e-6)
    assert result["difference"]["background"]["delta_zodi"] == pytest.approx(0.05, abs=1e-6)
    for name in ("a.png", "b.png", "diff.png", "sig.png", "meta.json"):
        assert (isolated_compare / result["job_id"] / name).exists()


def test_run_comparison_rejects_band_mismatch(isolated_compare):
    a = rec("A", 3, 60000.0)
    b = rec("B", 4, 60010.0)
    with pytest.raises(compare.CompareError) as exc:
        compare.run_comparison(a, b, RA0, DEC0, 0.2, "spherex_dr1")
    assert exc.value.code == "invalid_pair"


def test_run_comparison_rejects_unit_mismatch(isolated_compare, monkeypatch):
    early = make_cutout(image_value=1.0)
    late = make_cutout(image_value=1.0)
    # Rebuild the later cutout with a different BUNIT.
    w = make_wcs()
    header = w.to_header()
    header["BUNIT"] = "Jy"
    header["CRPIX1A"] = 0.0
    header["CRPIX2A"] = 0.0
    buf = io.BytesIO()
    fits.HDUList(
        [
            fits.PrimaryHDU(),
            fits.ImageHDU(data=np.ones((20, 20), np.float32), header=header, name="IMAGE"),
            fits.ImageHDU(data=np.zeros((20, 20), np.int32), header=header, name="FLAGS"),
            fits.ImageHDU(data=np.full((20, 20), 0.01, np.float32), header=header, name="VARIANCE"),
        ]
    ).writeto(buf)
    payloads = {"A": early, "B": buf.getvalue()}
    monkeypatch.setattr(compare, "fetch_cutout", lambda url, ra, dec, size: payloads[url[-1]])
    a = rec("A", 3, 60000.0, url="https://irsa.ipac.caltech.edu/A")
    b = rec("B", 3, 60010.0, url="https://irsa.ipac.caltech.edu/B")
    with pytest.raises(compare.CompareError) as exc:
        compare.run_comparison(a, b, RA0, DEC0, 0.2, "spherex_dr1")
    assert exc.value.code == "unit_mismatch"


# ---------------------------------------------------------------- API errors


client = TestClient(app)


def test_compare_result_unknown_observation_returns_404(monkeypatch):
    monkeypatch.setattr("app.main.sia.query_sia", lambda *a, **k: [rec("A", 3, 60000.0)])
    r = client.get(
        "/api/compare/result",
        params={"ra": RA0, "dec": DEC0, "obs_id_a": "NOPE", "obs_id_b": "A", "band_a": 3, "band_b": 3},
    )
    assert r.status_code == 404


def test_compare_result_rejects_invalid_pair(monkeypatch):
    monkeypatch.setattr(
        "app.main.sia.query_sia",
        lambda *a, **k: [rec("A", 3, 60000.0), rec("B", 4, 60010.0)],
    )
    r = client.get(
        "/api/compare/result",
        params={"ra": RA0, "dec": DEC0, "obs_id_a": "A", "obs_id_b": "B", "band_a": 3, "band_b": 4},
    )
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "invalid_pair"


def test_compare_result_rejects_out_of_range_band():
    r = client.get(
        "/api/compare/result",
        params={"ra": RA0, "dec": DEC0, "obs_id_a": "A", "obs_id_b": "B", "band_a": 9, "band_b": 3},
    )
    assert r.status_code == 422


def test_compare_result_stalled_sia_maps_to_502(monkeypatch):
    def stalled(*a, **k):
        raise TimeoutError("SIA query did not complete within 60 s; the upstream IRSA SIA service stalled.")

    monkeypatch.setattr("app.main.sia.query_sia", stalled)
    r = client.get(
        "/api/compare/result",
        params={"ra": RA0, "dec": DEC0, "obs_id_a": "A", "obs_id_b": "B", "band_a": 3, "band_b": 3},
    )
    assert r.status_code == 502
    assert "SIA query failed" in r.json()["detail"]
    assert "timed out" in r.json()["detail"] or "did not complete" in r.json()["detail"]


def test_compare_file_rejects_traversal():
    r = client.get("/api/compare/file/..%2F..%2Fsecret/a.png")
    assert r.status_code in (404, 400)


def test_compare_available_groups_by_band(monkeypatch):
    rows = [
        rec("A", 3, 60000.0),
        rec("B", 3, 60010.0),
        rec("C", 2, 60005.0),
    ]
    monkeypatch.setattr("app.main.sia.query_sia", lambda *a, **k: rows)
    r = client.get("/api/compare/available", params={"ra": RA0, "dec": DEC0})
    assert r.status_code == 200
    body = r.json()
    assert body["n_observations"] == 3
    bands = {g["band"]: g for g in body["bands"]}
    assert set(bands) == {2, 3}
    assert len(bands[3]["observations"]) == 2
    assert any(p["band"] == 3 and p["dt_days"] == pytest.approx(10.0) for p in body["pairs"])
