# SPHEREx Vision data backend (M1–M2C)

FastAPI service that talks to IRSA on the frontend's behalf. Read-only:
SIA2 metadata search, FITS cutout retrieval, PNG tile rendering, WCS helpers,
temporal comparison with numerical products, candidate residual detection.

## Setup (run on your machine)

```powershell
cd "SPHEREx Astronomy Explorer\backend"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The frontend default backend is `http://localhost:8001`
(override with `VITE_SPHEREX_API` in a `.env` file — never commit secrets).
The static preview is served separately (e.g. `http://127.0.0.1:5173`).

## Reliability

- SIA metadata queries are bounded by `SPHEREX_SIA_TIMEOUT_S` (default 60 s).
  Transient upstream failures get at most three attempts total, with 250 ms
  and 500 ms backoff delays. Identical in-flight searches are shared.
  Exhausted failures return HTTP 502 with a JSON `detail`; they are never
  reported as an empty successful result.
- Cutout downloads use `SPHEREX_HTTP_TIMEOUT` (default 60 s) plus redirect
  host checks and a 200 MB cap.
- Live IRSA availability varies. Tests mock network responses and do not
  establish current archive availability.

## Endpoints

- `GET /health` → service status.
- `GET /api/observations?ra=&dec=&radius_deg=&collection=`
  Primary frontend SIA2 metadata search (via astroquery). Returns real records
  and counts; an empty response means no coverage only after a successful query.
- `GET /api/regions/search?ra=&dec=&radius_deg=&collection=`
  Compatibility endpoint with the same SIA2 query and response semantics.
- `GET /api/tiles/preview?ra=&dec=&size_deg=&collection=`
  Picks the first SIA row carrying an `access_url`, fetches a Cutout
  Service subset, renders a display PNG, caches it, returns
  `{tile_id, image_url, metadata, provenance}`.
  404 when the region has no usable observation.
- `GET /api/compare/available?ra=&dec=&radius_deg=&collection=`
  Real observations that can form a same-band temporal pair (metadata only).
- `GET /api/compare/result?ra=&dec=&size_deg=&collection=&obs_id_a=&obs_id_b=&band_a=&band_b=`
  Runs the documented comparison for two server-resolved observations:
  same band, separation >= 0.5 d, earlier epoch as reference grid,
  `difference = later - earlier`, PSF matching, variance propagation.
  Persists display PNGs plus numerical products (`arrays.npz`,
  `products.json`) for candidate detection; the job ID is deterministic.
- `GET /api/compare/file/{job_id}/{name}` → cached PNG or `meta.json`.
- `GET /api/compare/jobs` → stored jobs with product/detection availability.
- `POST /api/candidates/detect` with `{job_id, threshold_sigma, min_area, deblend}`
  Evidence-based residual detection on the stored numerical products
  (never PNG pixels). Positive and negative residuals segmented separately
  with `photutils`; zero candidates is an honest result.
- `GET /api/candidates/{job_id}` → cached detection result.
- `GET /api/candidates/{job_id}/file/detection.json` → cached artefact.

Three things this platform keeps separate:

1. **Temporal image comparison** — a diagnostic `later - earlier` difference
   of two same-band epochs (M2B). It shows change; it finds nothing.
2. **Candidate residual detection** — mask-aware segmentation of that
   difference above a conservative threshold (M2C). A candidate residual is
   not a discovery and requires further validation.
3. **Confirmed astronomical discovery** — something this platform never
   claims. No planet, transient, asteroid, moving object or Planet X is
   asserted anywhere; quality flags and limitations ship with every result.

## Dependency reasons (M1 minimal set)

| Package | Why |
|---|---|
| fastapi, uvicorn | HTTP API + ASGI server |
| astroquery | IRSA SIA2 metadata search |
| astropy | FITS I/O, WCS, coordinates, units (also an astroquery dependency) |
| pillow | PNG tile rendering from cutout arrays |
| httpx | cutout downloads + FastAPI TestClient |
| pytest | test runner |
| reproject | WCS-based reprojection onto the reference pixel grid (M2B) |
| scipy | erf() for pixel-integrated PSF matching kernels (M2B) |
| photutils | detect_sources/deblend_sources/SourceCatalog segmentation (M2C) |

Deferred (not M1/M2): pyvo (astroquery covers current needs), sep,
SExtractor.

## Project documentation

For project-wide setup, data sources, attribution, and scientific limitations,
see the [root README](../README.md).

## Testing

```powershell
cd backend
python -m pytest tests/ -q
```

Frontend checks: `npm run build`, `npx tsc --noEmit`. Backend tests use mocked
network responses; passing tests do not verify live IRSA availability.

## Disclaimer

SPHEREx Vision is an independent participant project developed for NASA
Space Apps Challenge. It is not affiliated with, endorsed by, or an
official product of NASA.
