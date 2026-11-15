"""API contract tests (no network). Live behaviour verified separately."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True and body["service"] == "spherex-backend"


def test_regions_search_rejects_bad_coords():
    assert client.get("/api/regions/search", params={"ra": 400, "dec": 0}).status_code == 422
    assert client.get("/api/regions/search", params={"ra": 10, "dec": -100}).status_code == 422
    assert client.get("/api/regions/search", params={"ra": 10, "dec": 0, "collection": "nope"}).status_code == 422


def test_tiles_preview_rejects_bad_size():
    r = client.get("/api/tiles/preview", params={"ra": 10, "dec": 0, "size_deg": 5})
    assert r.status_code == 422


def test_unknown_tile_404():
    assert client.get("/api/tiles/file/doesnotexist").status_code == 404


def test_regions_search_empty_is_honest_empty(monkeypatch):
    # No coverage is a 200 with zero counts — never confused with a failure.
    monkeypatch.setattr("app.main.sia.query_sia", lambda *a, **k: [])
    r = client.get("/api/regions/search", params={"ra": 10, "dec": 0, "radius_deg": 0.05})
    assert r.status_code == 200
    body = r.json()
    assert body["n_rows"] == 0 and body["n_obs"] == 0 and body["records"] == []


def test_tiles_preview_unknown_observation_404(monkeypatch):
    import app.sia as sia_mod

    row = {
        "obs_id": "REAL-ONLY",
        "band": 3,
        "detector": 3,
        "collection": "spherex_dr1",
        "t_min_mjd": 60000.0,
        "t_max_mjd": 60000.001,
        "access_url": "https://irsa.ipac.caltech.edu/x.fits",
        "access_format": "image/fits",
    }
    monkeypatch.setattr(sia_mod, "query_sia", lambda *a, **k: [row])
    r = client.get(
        "/api/tiles/preview",
        params={"ra": 10, "dec": 0, "obs_id": "NOPE-NOPE"},
    )
    assert r.status_code == 404


def test_observations_include_footprint_passthrough(monkeypatch):
    poly = "POLYGON ICRS 133.0 -7.0 134.0 -7.0 134.0 -8.0 133.0 -7.0"
    row = {
        "obs_id": "FP-1",
        "band": 3,
        "detector": 3,
        "collection": "spherex_dr1",
        "t_min_mjd": 60000.0,
        "t_max_mjd": 60000.001,
        "access_url": "https://irsa.ipac.caltech.edu/x.fits",
        "access_format": "image/fits",
        "s_region": poly,
        "footprint": {"kind": "polygon", "vertices": [[133.0, -7.0]]},
    }
    monkeypatch.setattr("app.main.sia.query_sia", lambda *a, **k: [row])
    r = client.get("/api/observations", params={"ra": 10, "dec": 0, "radius_deg": 0.05})
    assert r.status_code == 200
    rec = r.json()["records"][0]
    assert rec["s_region"] == poly
    assert rec["footprint"]["kind"] == "polygon"
