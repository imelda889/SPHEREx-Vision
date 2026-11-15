# SPHEREx Vision

**Explore the Sky. Discover What Changes.**

SPHEREx Vision is an interactive astronomy explorer for visualizing the
SPHEREx infrared sky, comparing observations, and investigating potential
astronomical changes. It is an independent NASA Space Apps Challenge
participant project, not affiliated with, endorsed by, or an official product
of NASA.

## Run locally (Windows PowerShell)

Install frontend dependencies once:

```powershell
npm ci
```

In one terminal, start the read-only FastAPI service:

```powershell
Set-Location backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

In a second terminal at the repository root, start the frontend:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```

Open <http://127.0.0.1:5173>. The frontend uses `http://localhost:8001` for the
backend by default. Override it with `VITE_SPHEREX_API` when necessary. Do not
put credentials in frontend environment variables or commit local `.env` files.

## Data sources and attribution

- SPHEREx DR1 Level-2 HiPS cube, properties and FITS products: NASA/IPAC
  Infrared Science Archive (IRSA), <https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube>.
- Observation search and cutouts: NASA/IPAC IRSA SIA2 and Cutout services.
- 2MASS and DSS2 context backgrounds: CDS HiPS; these are not SPHEREx science
  imagery and are labeled as context in the application.
- SPHEREx mission information and explanatory supplement:
  <https://irsa.ipac.caltech.edu/data/SPHEREx/docs/>.

This project uses React, Vite, Tailwind CSS, Aladin Lite, Three.js,
`healpix-ts`, and MediaPipe Tasks Vision in the frontend. The backend uses
FastAPI, Astropy, Astroquery, NumPy, SciPy, Reproject, Pillow, and Photutils.
See `package.json` and `backend/requirements.txt` for package versions and the
complete dependency lists.

## Scientific limitations

- HiPS PNG layers are display products, not calibrated flux measurements.
- The `hips_cube_firstframe=1` to PNG layer-suffix convention is not
  independently resolved. No unverified offset is applied.
- The 2D All-Sky raster-to-sky registration and exact HEALPix edge/pole behavior
  are only partially validated. Use Coverage Map or IRSA for precise feature
  positions.
- The 3D globe's face geometry is not validated for feature positions; globe
  click selection is disabled. Use Coverage Map or IRSA for sky-position
  searches.
- Missing source pixels remain missing; an RGB pixel is omitted if any
  selected channel is missing.
- Coverage footprints, context surveys, and SPHEREx imagery are distinct
  products; 2MASS, DSS2, and local illustrations are never SPHEREx data.
- Camera gestures are intended for Aladin Lite Coverage Map only. Real-camera
  gesture behavior has not been verified. Mouse and keyboard alternatives
  remain available.
- Temporal differences and candidate residuals are diagnostic. They are not
  calibrated probabilities or confirmed astronomical discoveries.

## Checks

```powershell
npm run build
npx tsc --noEmit
Set-Location backend
.\.venv\Scripts\python.exe -m pytest tests -q
```
