"""Tests for the SIA2 client. No network: URL builder + normalizer + grouping
+ deadline wrapper (blocking transport is simulated with events, never IRSA)."""
import io
import threading
import time

import pytest
from pyvo.dal.exceptions import DALServiceError

from app import config
from app import sia
from app.sia import build_sia_url, detector_from_bandpass, group_by_obsid, normalize_row, parse_s_region


def test_build_sia_url_matches_documented_pattern():
    url = build_sia_url("https://irsa.ipac.caltech.edu/SIA", "spherex_qr3", 127.69444, -39.17760, 0.01)
    assert url.startswith("https://irsa.ipac.caltech.edu/SIA?")
    assert "COLLECTION=spherex_qr3" in url
    assert "POS=circle" in url and "127.69444" in url


def test_build_sia_url_rejects_bad_inputs():
    import pytest

    with pytest.raises(ValueError):
        build_sia_url(config.IRSA_SIA_URL, "spherex_nope", 10.0, 0.0, 0.05)
    with pytest.raises(ValueError):
        build_sia_url(config.IRSA_SIA_URL, "spherex_dr1", 400.0, 0.0, 0.05)
    with pytest.raises(ValueError):
        build_sia_url(config.IRSA_SIA_URL, "spherex_dr1", 10.0, 0.0, 0.0)


def test_detector_from_bandpass():
    assert detector_from_bandpass("SPHEREx-D3") == 3
    assert detector_from_bandpass("SPHEREx-D1") == 1
    assert detector_from_bandpass("other") is None
    assert detector_from_bandpass(None) is None
    assert detector_from_bandpass("SPHEREx-D9") is None


# Two rows excerpted verbatim from a real 2026-11-13 SIA2 response
# (test location RA 133.786245 Dec -7.244372, r=0.05deg). Kept to pin the
# normalizer against the real ObsCore shape — not mock science data.
REAL_ROW_D3 = {
    "obs_id": "2025W19_1B_0116_1",
    "energy_bandpassname": "SPHEREx-D3",
    "em_min": 1.63010e-06,
    "em_max": 2.43460e-06,
    "t_min": 60800.700028,
    "t_max": 60800.701361,
    "s_fov": 3.485,
    "calib_level": 2,
    "access_url": "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/l2b-v27-2026-197/3/level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits",
    "cloud_access": '{"aws": {"bucket_name": "x", "key": "y"}}',
    "obs_release_date": "2026-09-27 23:59:28",
}
REAL_ROW_D2 = dict(REAL_ROW_D3, obs_id="2025W19_1B_0116_1", energy_bandpassname="SPHEREx-D2")


def test_normalize_row_real_shape():
    rec = normalize_row(REAL_ROW_D3, "spherex_dr1")
    assert rec["obs_id"] == "2025W19_1B_0116_1"
    assert rec["detector"] == 3 and rec["band"] == 3
    assert rec["t_min_mjd"] == 60800.700028
    assert rec["access_url"].endswith(".fits")


def test_group_by_obsid_dedups():
    grouped = group_by_obsid([
        normalize_row(REAL_ROW_D3, "spherex_dr1"),
        normalize_row(REAL_ROW_D2, "spherex_dr1"),
        {"obs_id": None},
    ])
    assert set(grouped) == {"2025W19_1B_0116_1"}
    assert len(grouped["2025W19_1B_0116_1"]) == 2


# ---------------------------------------------------------------- footprint


REAL_POLYGON = (
    "POLYGON ICRS 133.24990295057214 -6.792366530370936 "
    "136.573730639645 -7.893897878777517 135.6087246915983 -11.252283174147388 "
    "132.22997686194108 -10.127262014271603 133.24990295057214 -6.792366530370936"
)


def test_parse_s_region_polygon_quad():
    fp = parse_s_region(REAL_POLYGON)
    assert fp is not None and fp["kind"] == "polygon"
    assert len(fp["vertices"]) == 5
    assert fp["vertices"][0] == [133.24990295057214, -6.792366530370936]


def test_parse_s_region_circle():
    fp = parse_s_region("Circle ICRS 10.0 -20.0 0.5")
    assert fp == {"kind": "circle", "center": [10.0, -20.0], "radius_deg": 0.5}


def test_parse_s_region_rejects_gracefully():
    for bad in (None, "", "   ", "POLYGON ICRS 1.0", "POLYGON ICRS 1.0 two 3.0",
                "POLYGON 1.0 2.0", "CIRCLE ICRS 1.0 2.0 -0.5", "CIRCLE ICRS 1.0 2.0",
                "BLOB ICRS 1.0 2.0 3.0", 123):
        assert parse_s_region(bad) is None


def test_normalize_row_carries_footprint():
    rec = normalize_row(dict(REAL_ROW_D3, s_region=REAL_POLYGON), "spherex_dr1")
    assert rec["s_region"] == REAL_POLYGON
    assert rec["footprint"] is not None and rec["footprint"]["kind"] == "polygon"
    rec2 = normalize_row(dict(REAL_ROW_D3, s_region=None), "spherex_dr1")
    assert rec2["s_region"] is None and rec2["footprint"] is None


# ---------------------------------------------------------------- deadline


def test_query_sia_returns_rows_from_transport(monkeypatch):
    sentinel = [{"obs_id": "X"}]
    monkeypatch.setattr(sia, "_run_query_sia", lambda *a: sentinel)
    assert sia.query_sia("spherex_dr1", 10.0, 0.0, 0.05, timeout_s=5.0) is sentinel


def test_query_sia_retries_transient_502_then_succeeds(monkeypatch):
    calls = []
    delays = []
    sentinel = [{"obs_id": "REAL-1"}]

    def flaky(*args):
        calls.append(args)
        if len(calls) == 1:
            raise DALServiceError("502 Proxy Error", code=502)
        return sentinel

    monkeypatch.setattr(sia, "_run_query_sia", flaky)
    monkeypatch.setattr(sia.time, "sleep", delays.append)

    assert sia.query_sia("spherex_dr1", 10.0, 0.0, 0.05, timeout_s=5.0) is sentinel
    assert len(calls) == 2
    assert delays == [0.25]


def test_query_sia_stops_after_retry_limit(monkeypatch):
    calls = []
    delays = []

    def unavailable(*args):
        calls.append(args)
        raise DALServiceError("502 Proxy Error", code=502)

    monkeypatch.setattr(sia, "_run_query_sia", unavailable)
    monkeypatch.setattr(sia.time, "sleep", delays.append)

    with pytest.raises(sia.SIAUnavailableError, match="after 3 attempt"):
        sia.query_sia("spherex_dr1", 11.0, 0.0, 0.05, timeout_s=5.0)

    assert len(calls) == 3
    assert delays == [0.25, 0.5]


def test_query_sia_does_not_retry_permanent_client_errors(monkeypatch):
    calls = []

    def bad_request(*args):
        calls.append(args)
        raise DALServiceError("400 Bad Request", code=400)

    monkeypatch.setattr(sia, "_run_query_sia", bad_request)

    with pytest.raises(DALServiceError, match="400 Bad Request"):
        sia.query_sia("spherex_dr1", 12.0, 0.0, 0.05, timeout_s=5.0)

    assert len(calls) == 1


def test_query_sia_shares_identical_in_flight_requests(monkeypatch):
    started = threading.Event()
    release = threading.Event()
    calls = []
    results = []

    def blocking_query(*args):
        calls.append(args)
        started.set()
        assert release.wait(5.0)
        return [{"obs_id": "REAL-2"}]

    monkeypatch.setattr(sia, "_run_query_sia", blocking_query)

    def query():
        results.append(sia.query_sia("spherex_dr1", 13.0, 0.0, 0.05, timeout_s=5.0))

    first = threading.Thread(target=query)
    second = threading.Thread(target=query)
    first.start()
    assert started.wait(2.0)
    second.start()
    time.sleep(0.05)
    release.set()
    first.join(timeout=5.0)
    second.join(timeout=5.0)

    assert not first.is_alive() and not second.is_alive()
    assert len(calls) == 1
    assert results == [[{"obs_id": "REAL-2"}], [{"obs_id": "REAL-2"}]]


def test_query_sia_timeout_raises_quickly(monkeypatch):
    gate = threading.Event()

    def stuck(*a):
        gate.wait(60.0)
        return []

    monkeypatch.setattr(sia, "_run_query_sia", stuck)
    t0 = time.monotonic()
    try:
        with pytest.raises(TimeoutError, match="did not complete within"):
            sia.query_sia("spherex_dr1", 14.0, 0.0, 0.05, timeout_s=0.2)
    finally:
        gate.set()
    assert time.monotonic() - t0 < 10.0


def test_query_sia_rejects_bad_collection_without_touching_network(monkeypatch):
    called = []
    monkeypatch.setattr(sia, "_run_query_sia", lambda *a: called.append(a) or [])
    with pytest.raises(ValueError):
        sia.query_sia("spherex_nope", 10.0, 0.0, 0.05, timeout_s=5.0)
    assert called == []


def test_query_sia_rejects_non_positive_timeout():
    with pytest.raises(ValueError):
        sia.query_sia("spherex_dr1", 10.0, 0.0, 0.05, timeout_s=0.0)
    with pytest.raises(ValueError):
        sia.query_sia("spherex_dr1", 10.0, 0.0, 0.05, timeout_s=-3.0)


def test_query_sia_propagates_upstream_errors(monkeypatch):
    def boom(*a):
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(sia, "_run_query_sia", boom)
    with pytest.raises(RuntimeError, match="upstream exploded"):
        sia.query_sia("spherex_dr1", 15.0, 0.0, 0.05, timeout_s=5.0)


def test_run_query_sia_parses_votable_rows_as_before(monkeypatch):
    from astropy.table import Table
    from astroquery.ipac.irsa import Irsa

    votable = b"""<?xml version="1.0"?>
    <VOTABLE version="1.3" xmlns="http://www.ivoa.net/xml/VOTable/v1.3">
      <RESOURCE type="results">
        <TABLE>
          <FIELD name="obs_id" datatype="char" arraysize="*"/>
          <FIELD name="energy_bandpassname" datatype="char" arraysize="*"/>
          <FIELD name="em_min" datatype="double"/>
          <FIELD name="em_max" datatype="double"/>
          <FIELD name="t_min" datatype="double"/>
          <FIELD name="t_max" datatype="double"/>
          <FIELD name="s_fov" datatype="double"/>
          <FIELD name="calib_level" datatype="int"/>
          <FIELD name="access_url" datatype="char" arraysize="*"/>
          <FIELD name="access_format" datatype="char" arraysize="*"/>
          <DATA>
            <TABLEDATA>
              <TR>
                <TD>2025W19_1B_0116_1</TD><TD>SPHEREx-D3</TD>
                <TD>1.6301e-6</TD><TD>2.4346e-6</TD>
                <TD>60800.700028</TD><TD>60800.701361</TD>
                <TD>3.485</TD><TD>2</TD>
                <TD>https://irsa.ipac.caltech.edu/observation.fits</TD>
                <TD>image/fits</TD>
              </TR>
            </TABLEDATA>
          </DATA>
        </TABLE>
      </RESOURCE>
    </VOTABLE>"""
    table = Table.read(io.BytesIO(votable), format="votable")
    monkeypatch.setattr(Irsa, "query_sia", lambda **kwargs: table)

    records = sia._run_query_sia("spherex_dr1", 10.0, 0.0, 0.05)

    assert len(records) == 1
    assert records[0]["obs_id"] == "2025W19_1B_0116_1"
    assert records[0]["detector"] == 3
    assert records[0]["em_min_m"] == pytest.approx(1.6301e-6)


def test_health_responsive_while_one_sia_call_stalled(monkeypatch):
    # A stalled SIA transport must not wedge the process: while one caller
    # sits inside the blocking transport, the health endpoint still answers.
    # The stalled caller runs in a plain worker thread (the same blocking
    # pattern an API worker thread would execute); HTTP stays on the main
    # thread because TestClient instances are not thread-safe.
    from fastapi.testclient import TestClient

    from app.main import app

    gate = threading.Event()
    monkeypatch.setattr(sia, "_run_query_sia", lambda *a: gate.wait(60.0) or [])
    worker = threading.Thread(
        target=lambda: sia.query_sia("spherex_dr1", 16.0, 0.0, 0.05),
        daemon=True,
    )
    worker.start()
    time.sleep(0.5)  # let the worker thread reach the stalled transport
    try:
        r = TestClient(app).get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True
    finally:
        gate.set()
        worker.join(timeout=10.0)
    assert not worker.is_alive()
