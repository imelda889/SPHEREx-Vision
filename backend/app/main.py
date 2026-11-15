"""SPHEREx Vision data backend (M1): SIA2 search, cutout retrieval, PNG tiles.

Read-only w.r.t. the archive. Never invents observations, dates,
coordinates, or detections. Empty results propagate as empty lists —
the frontend renders those as honest pending states.
"""
from __future__ import annotations

import io
import json
import logging
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import candidates
from . import config
from . import compare
from . import fitsmeta
from . import sia
from . import tiles

log = logging.getLogger("spherex_backend")

app = FastAPI(title="SPHEREx Vision data backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8443",
        "http://127.0.0.1:8443",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8123",
        "http://127.0.0.1:8123",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "spherex-backend"
    version: str = "1.0.0"
    timestamp_unix: int = 0


class RegionRecord(BaseModel):
    obs_id: str | None = None
    collection: str
    detector: int | None = None
    band: int | None = None
    em_min_m: float | None = None
    em_max_m: float | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    s_fov_deg: float | None = None
    calib_level: int | None = None
    access_url: str | None = None
    access_format: str | None = None
    obs_release_date: str | None = None
    # Additive M3-footprint passthrough: raw STCS string plus parsed form
    # ({"kind": "polygon", "vertices": [[ra, dec], ...]} or
    # {"kind": "circle", "center": [ra, dec], "radius_deg": r}), else None.
    s_region: str | None = None
    footprint: dict[str, Any] | None = None


class RegionsResponse(BaseModel):
    ra: float
    dec: float
    radius_deg: float
    collection: str
    n_rows: int
    n_obs: int
    records: list[RegionRecord]


class ObservationRecord(BaseModel):
    """One selectable observation, with a has_access flag the UI can trust."""

    obs_id: str
    collection: str
    detector: int | None = None
    band: int | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    em_min_m: float | None = None
    em_max_m: float | None = None
    s_fov_deg: float | None = None
    access_format: str | None = None
    access_url: str | None = None
    has_access: bool = False


class TilePreview(BaseModel):
    tile_id: str
    image_url: str
    ra: float
    dec: float
    size_deg: float
    metadata: dict[str, Any]
    provenance: dict[str, Any]


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(timestamp_unix=int(time.time()))


@app.get("/api/regions/search", response_model=RegionsResponse)
def regions_search(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius_deg: float = Query(0.05, gt=0.0, le=1.0),
    collection: str = Query(config.DEFAULT_COLLECTION, pattern="^(spherex_dr1|spherex_dr1_deep|spherex_dr1_cube|spherex_qr3|spherex_qr3_deep)$"),
) -> RegionsResponse:
    try:
        records = sia.query_sia(collection, ra, dec, radius_deg)
    except Exception as exc:  # network/IRSA/astroquery failures -> 502, never fake rows
        log.exception("SIA query failed")
        raise HTTPException(status_code=502, detail=f"SIA query failed: {exc}") from exc
    grouped = sia.group_by_obsid(records)
    return RegionsResponse(
        ra=ra, dec=dec, radius_deg=radius_deg, collection=collection,
        n_rows=len(records), n_obs=len(grouped),
        records=[RegionRecord(**r) for r in records],
    )


@app.get("/api/observations", response_model=RegionsResponse)
def observations_search(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius_deg: float = Query(0.05, gt=0.0, le=config.MAX_SEARCH_RADIUS_DEG),
    collection: str = Query(config.DEFAULT_COLLECTION, pattern="^(spherex_dr1|spherex_dr1_deep|spherex_dr1_cube|spherex_qr3|spherex_qr3_deep)$"),
) -> RegionsResponse:
    """Observation search. Same source as /api/regions/search; the observation
    panel consumes this. Each record carries a has_access flag when built by
    the frontend; here we return the raw normalized rows plus a per-row flag."""
    try:
        records = sia.query_sia(collection, ra, dec, radius_deg)
    except Exception as exc:
        log.exception("SIA query failed")
        raise HTTPException(status_code=502, detail=f"SIA query failed: {exc}") from exc
    grouped = sia.group_by_obsid(records)
    return RegionsResponse(
        ra=ra, dec=dec, radius_deg=radius_deg, collection=collection,
        n_rows=len(records), n_obs=len(grouped),
        records=[RegionRecord(**r) for r in records],
    )


def _tile_paths(tile_id: str) -> tuple[Path, Path]:
    return config.CACHE_DIR / f"{tile_id}.png", config.CACHE_DIR / f"{tile_id}.json"


@app.get("/api/tiles/preview", response_model=TilePreview)
def tiles_preview(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    size_deg: float = Query(0.2, gt=0.0, le=1.0),
    collection: str = Query(config.DEFAULT_COLLECTION, pattern="^(spherex_dr1|spherex_dr1_deep|spherex_qr3|spherex_qr3_deep)$"),
    obs_id: str | None = Query(None, max_length=128),
) -> TilePreview:
    """Preview a specific observation's cutout.

    When obs_id is omitted, the first SIA row carrying an access_url is used
    (deterministic, documented). When provided, the observation is resolved
    server-side against live SIA2 results for the same region — the client
    never supplies a raw download URL.
    """
    try:
        records = sia.query_sia(collection, ra, dec, radius_deg=0.05)
    except Exception as exc:
        log.exception("SIA query failed")
        raise HTTPException(status_code=502, detail=f"SIA query failed: {exc}") from exc
    if not records:
        raise HTTPException(status_code=404, detail="No SPHEREx observations cover this region in the queried collection (honest empty result).")

    def _usable(rec: dict[str, Any]) -> bool:
        url = rec.get("access_url")
        if not url:
            return False
        try:
            tiles._assert_allowed_host(str(url))
            return True
        except ValueError:
            return False

    selected = None
    if obs_id:
        for rec in records:
            if rec.get("obs_id") == obs_id and _usable(rec):
                selected = rec
                break
        if selected is None:
            raise HTTPException(
                status_code=404,
                detail=f"Observation {obs_id!r} not found in this region/collection, or its access URL is unavailable.",
            )
    else:
        selected = next((r for r in records if _usable(r)), None)
        if selected is None:
            raise HTTPException(status_code=404, detail="SIA rows found but none carry a usable access_url.")

    access_url = str(selected["access_url"])
    cutout_url = tiles.build_cutout_url(access_url, ra, dec, size_deg)
    tile_id = tiles.tile_key(access_url, ra, dec, size_deg)
    png_path, meta_path = _tile_paths(tile_id)
    if not (png_path.exists() and meta_path.exists()):
        try:
            payload = tiles.fetch_bytes(cutout_url, timeout_s=config.HTTP_TIMEOUT_S, max_bytes=config.MAX_CUTOUT_BYTES)
        except Exception as exc:
            log.exception("Cutout fetch failed")
            raise HTTPException(status_code=502, detail=f"Cutout fetch failed: {exc}") from exc
        try:
            tiles.assert_fits_magic(payload)
            png_bytes, stats = tiles.render_png(payload)
            meta = fitsmeta.inspect_mef(io.BytesIO(payload), filename_hint=access_url.rsplit("/", 1)[-1])
        except (ValueError, OSError) as exc:
            raise HTTPException(status_code=502, detail=f"Cutout is not a usable MEF: {exc}") from exc
        png_path.write_bytes(png_bytes)
        meta["render_stats"] = stats
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    else:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta = dict(meta)
    meta["selected_obs_id"] = selected.get("obs_id")
    meta["selection_rule"] = f"server-resolved obs_id={selected.get('obs_id')!r}" if obs_id else "first SIA row carrying a usable access_url (documented, deterministic)"
    return TilePreview(
        tile_id=tile_id,
        image_url=f"/api/tiles/file/{tile_id}",
        ra=ra, dec=dec, size_deg=size_deg,
        metadata=meta,
        provenance={
            "collection": collection,
            "sia_query": {"ra": ra, "dec": dec, "radius_deg": 0.05},
            "cutout_url": cutout_url,
            "source": "IRSA Cutout Service; pixels unmodified except percentile stretch for display",
        },
    )


@app.get("/api/tiles/file/{tile_id}")
def tile_file(tile_id: str) -> Response:
    png_path, _ = _tile_paths(tile_id)
    if not png_path.exists() or "/" in tile_id or "\\" in tile_id or ".." in tile_id:
        raise HTTPException(status_code=404, detail="Unknown tile id.")
    return Response(content=png_path.read_bytes(), media_type="image/png")


# --------------------------------------------------------------------------
# M2B: temporal comparison
# --------------------------------------------------------------------------


class CompareObservation(BaseModel):
    obs_id: str
    band: int | None = None
    detector: int | None = None
    t_min_mjd: float | None = None
    t_max_mjd: float | None = None
    obs_date_utc: str | None = None
    access_format: str | None = None
    has_access: bool = False
    s_fov_deg: float | None = None


class CompareBandGroup(BaseModel):
    band: int | None = None
    detector: int | None = None
    n_observations: int
    observations: list[CompareObservation]


class ComparePairSuggestion(BaseModel):
    obs_id_earlier: str
    obs_id_later: str
    band: int | None = None
    dt_days: float


class CompareAvailableResponse(BaseModel):
    ra: float
    dec: float
    radius_deg: float
    collection: str
    n_rows: int
    n_observations: int
    min_epoch_separation_days: float
    bands: list[CompareBandGroup]
    pairs: list[ComparePairSuggestion]


@app.get("/api/compare/available", response_model=CompareAvailableResponse)
def compare_available(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    radius_deg: float = Query(0.05, gt=0.0, le=config.MAX_SEARCH_RADIUS_DEG),
    collection: str = Query(config.DEFAULT_COLLECTION, pattern="^(spherex_dr1|spherex_dr1_deep|spherex_qr3|spherex_qr3_deep)$"),
    min_separation_days: float = Query(config.MIN_EPOCH_SEPARATION_DAYS, ge=0.0, le=3650.0),
) -> CompareAvailableResponse:
    """List real observations that can be paired for a temporal comparison.

    Only metadata is returned here. No pixel data is fetched and nothing is
    fabricated: an empty list means the archive genuinely returned no usable
    rows for this region/collection.
    """
    try:
        records = sia.query_sia(collection, ra, dec, radius_deg)
    except Exception as exc:  # noqa: BLE001
        log.exception("SIA query failed")
        raise HTTPException(status_code=502, detail=f"SIA query failed: {exc}") from exc

    seen: dict[tuple[str, int | None], dict[str, Any]] = {}
    for rec in records:
        url = rec.get("access_url")
        usable = False
        if url:
            try:
                tiles._assert_allowed_host(str(url))
                usable = True
            except ValueError:
                usable = False
        key = (str(rec.get("obs_id")), rec.get("band"))
        if key in seen:
            continue
        seen[key] = {
            "obs_id": str(rec.get("obs_id")),
            "band": rec.get("band"),
            "detector": rec.get("detector"),
            "t_min_mjd": rec.get("t_min_mjd"),
            "t_max_mjd": rec.get("t_max_mjd"),
            "obs_date_utc": compare.mjd_to_iso(rec.get("t_min_mjd")),
            "access_format": rec.get("access_format"),
            "has_access": usable,
            "s_fov_deg": rec.get("s_fov_deg"),
        }

    groups: dict[int | None, list[dict[str, Any]]] = {}
    for row in seen.values():
        groups.setdefault(row["band"], []).append(row)

    bands: list[CompareBandGroup] = []
    pairs: list[ComparePairSuggestion] = []
    for band in sorted(groups, key=lambda b: (b is None, b if b is not None else 0)):
        rows = sorted(groups[band], key=lambda r: float(r["t_min_mjd"] or 0.0))
        bands.append(
            CompareBandGroup(
                band=band,
                detector=rows[0]["detector"] if rows else None,
                n_observations=len(rows),
                observations=[CompareObservation(**r) for r in rows],
            )
        )
        usable = [r for r in rows if r["has_access"] and r["t_min_mjd"] is not None]
        if len(usable) >= 2:
            # Suggest the widest real separation first, then the tightest.
            a, b = usable[0], usable[-1]
            pairs.append(
                ComparePairSuggestion(
                    obs_id_earlier=a["obs_id"],
                    obs_id_later=b["obs_id"],
                    band=band,
                    dt_days=float(b["t_min_mjd"]) - float(a["t_min_mjd"]),
                )
            )
            if len(usable) > 2:
                a2, b2 = usable[-2], usable[-1]
                dt2 = float(b2["t_min_mjd"]) - float(a2["t_min_mjd"])
                if dt2 >= min_separation_days:
                    pairs.append(
                        ComparePairSuggestion(
                            obs_id_earlier=a2["obs_id"],
                            obs_id_later=b2["obs_id"],
                            band=band,
                            dt_days=dt2,
                        )
                    )

    return CompareAvailableResponse(
        ra=ra,
        dec=dec,
        radius_deg=radius_deg,
        collection=collection,
        n_rows=len(records),
        n_observations=len(seen),
        min_epoch_separation_days=min_separation_days,
        bands=bands,
        pairs=pairs,
    )


@app.get("/api/compare/result")
def compare_result(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    size_deg: float = Query(config.COMPARE_SIZE_DEG, gt=0.0, le=config.COMPARE_MAX_SIZE_DEG),
    collection: str = Query(config.DEFAULT_COLLECTION, pattern="^(spherex_dr1|spherex_dr1_deep|spherex_qr3|spherex_qr3_deep)$"),
    obs_id_a: str = Query(..., max_length=128),
    obs_id_b: str = Query(..., max_length=128),
    band_a: int = Query(..., ge=1, le=6),
    band_b: int = Query(..., ge=1, le=6),
    min_separation_days: float = Query(config.MIN_EPOCH_SEPARATION_DAYS, ge=0.0, le=3650.0),
) -> dict[str, Any]:
    """Run the documented comparison pipeline for two server-resolved observations.

    An observation ID is not unique on its own: one SIA2 row exists per detector
    band, so the band must be supplied and is validated server-side.
    """
    radius = max(0.01, size_deg * 0.5)
    try:
        records = sia.query_sia(collection, ra, dec, radius)
    except Exception as exc:  # noqa: BLE001
        log.exception("SIA query failed")
        raise HTTPException(status_code=502, detail=f"SIA query failed: {exc}") from exc
    if not records:
        raise HTTPException(
            status_code=404,
            detail="No SPHEREx observations cover this region in the queried collection.",
        )
    by_key = {
        (str(r.get("obs_id")), r.get("band")): r for r in records if r.get("access_url")
    }
    rec_a = by_key.get((obs_id_a, band_a))
    rec_b = by_key.get((obs_id_b, band_b))
    missing = [
        f"{oid}/D{band}"
        for oid, band, rec in ((obs_id_a, band_a, rec_a), (obs_id_b, band_b, rec_b))
        if rec is None
    ]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Observation(s) {missing} were not returned by SIA2 for this region/collection.",
        )
    try:
        return compare.run_comparison(
            rec_a, rec_b, ra, dec, size_deg, collection, min_sep_days=min_separation_days
        )
    except compare.CompareError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except (ValueError, OSError) as exc:
        log.exception("Comparison failed")
        raise HTTPException(status_code=502, detail=f"Comparison failed: {exc}") from exc


@app.get("/api/compare/file/{job_id}/{name}")
def compare_file(job_id: str, name: str) -> Response:
    allowed = {"a.png", "b.png", "diff.png", "diff_raw.png", "sig.png", "meta.json"}
    if name not in allowed or "/" in job_id or "\\" in job_id or ".." in job_id:
        raise HTTPException(status_code=404, detail="Unknown comparison artefact.")
    path = config.COMPARE_DIR / job_id / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Comparison artefact not found.")
    media = "image/png" if name.endswith(".png") else "application/json"
    return Response(content=path.read_bytes(), media_type=media)


# --------------------------------------------------------------------------
# M2C: candidate residual detection
# --------------------------------------------------------------------------


@app.get("/api/compare/jobs")
def compare_jobs() -> dict[str, Any]:
    """List stored comparison jobs and whether detection products exist."""
    jobs: list[dict[str, Any]] = []
    if config.COMPARE_DIR.is_dir():
        for job_dir in sorted(config.COMPARE_DIR.iterdir()):
            if not job_dir.is_dir():
                continue
            meta_path = job_dir / "meta.json"
            if not meta_path.exists():
                continue
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            obs = meta.get("observations", {}) if isinstance(meta.get("observations"), dict) else {}
            jobs.append(
                {
                    "job_id": job_dir.name,
                    "obs_earlier": obs.get("earlier", {}).get("obs_id"),
                    "obs_later": obs.get("later", {}).get("obs_id"),
                    "band": obs.get("earlier", {}).get("band"),
                    "epoch_separation_days": meta.get("epoch_separation_days"),
                    "valid_fraction": (meta.get("difference") or {}).get("valid_fraction"),
                    "has_products": (job_dir / "arrays.npz").exists()
                    and (job_dir / "products.json").exists(),
                    "has_detection": (config.CANDIDATE_DIR / job_dir.name / "detection.json").exists(),
                }
            )
    return {"jobs": jobs, "n_jobs": len(jobs)}


class CandidateDetectRequest(BaseModel):
    job_id: str
    threshold_sigma: float = config.CANDIDATE_THRESHOLD_SIGMA
    min_area: int = config.CANDIDATE_MIN_AREA
    deblend: bool = True


@app.post("/api/candidates/detect")
def candidates_detect(body: CandidateDetectRequest) -> dict[str, Any]:
    """Run evidence-based residual detection for one stored comparison job."""
    try:
        return candidates.run_detection(
            body.job_id,
            threshold_sigma=body.threshold_sigma,
            min_area=body.min_area,
            deblend=body.deblend,
        )
    except candidates.CandidateError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except (ValueError, OSError) as exc:
        log.exception("Candidate detection failed")
        raise HTTPException(status_code=502, detail=f"Candidate detection failed: {exc}") from exc


@app.get("/api/candidates/{job_id}")
def candidates_result(job_id: str) -> dict[str, Any]:
    """Return the cached detection result for one comparison job."""
    try:
        return candidates.read_cached(job_id)
    except candidates.CandidateError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


@app.get("/api/candidates/{job_id}/file/{name}")
def candidates_file(job_id: str, name: str) -> Response:
    allowed = {"detection.json"}
    if name not in allowed or "/" in job_id or "\\" in job_id or ".." in job_id:
        raise HTTPException(status_code=404, detail="Unknown candidate artefact.")
    try:
        candidates.load_job(job_id)
    except candidates.CandidateError as exc:
        raise HTTPException(
            status_code=exc.status,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    path = config.CANDIDATE_DIR / job_id / name
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="No candidate detection has been run for this comparison job yet.",
        )
    return Response(content=path.read_bytes(), media_type="application/json")
