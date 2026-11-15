"""M2B Phase A probe: download two real DR1 cutouts and report HDU/WCS facts."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import sia, tiles  # noqa: E402

RA, DEC, SIZE = 133.786245, -7.244372, 0.2
OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
OUT.mkdir(parents=True, exist_ok=True)


def find(obs_id: str, band: str = "SPHEREx-D3") -> dict:
    rows = sia.query_sia("spherex_dr1", RA, DEC, 0.05)
    for r in rows:
        if r.get("obs_id") == obs_id and r.get("band") == int(band.split("-D")[-1]):
            return r
    raise SystemExit(f"obs {obs_id} not found")


def report(obs_id: str) -> dict:
    rec = find(obs_id)
    url = tiles.build_cutout_url(rec["access_url"], RA, DEC, SIZE)
    print(f"\n=== {obs_id} ===")
    print("t_min_mjd:", rec["t_min_mjd"], "detector:", rec["detector"])
    print("url:", url)
    path = OUT / f"{obs_id}.fits"
    if not path.exists():
        path.write_bytes(tiles.fetch_bytes(url))
    print("bytes:", path.stat().st_size)

    with fits.open(path) as hdul:
        print("HDUs:", [(i, h.name, h.data.shape if h.data is not None else None, h.data.dtype if h.data is not None else None) for i, h in enumerate(hdul)])
        out = {"obs_id": obs_id, "hdus": [], "wcs": None}
        for h in hdul:
            out["hdus"].append(
                {
                    "name": h.name,
                    "shape": list(h.data.shape) if h.data is not None else None,
                    "dtype": str(h.data.dtype) if h.data is not None else None,
                    "bunit": h.header.get("BUNIT"),
                }
            )
        img = hdul["IMAGE"].data
        var = hdul["VARIANCE"].data
        flg = hdul["FLAGS"].data
        print("IMAGE finite:", np.isfinite(img).all(), "min/max:", np.nanmin(img), np.nanmax(img))
        print("VARIANCE finite:", np.isfinite(var).all(), "min/median:", np.nanmin(var), np.nanmedian(var))
        print("FLAGS unique:", np.unique(flg)[:10], "nonzero frac:", float((flg != 0).mean()))
        print("BUNIT:", hdul["IMAGE"].header.get("BUNIT"))
        w = WCS(hdul["IMAGE"].header)
        print("WCS has_celestial:", w.has_celestial, "pixel_scale_matrix:", w.pixel_scale_matrix.tolist())
        print("WCS center:", w.pixel_to_world_values(img.shape[1] / 2, img.shape[0] / 2))
        out["wcs"] = {
            "has_celestial": bool(w.has_celestial),
            "ctype": list(w.wcs.ctype),
            "crpix": list(map(float, w.wcs.crpix)),
            "crval": list(map(float, w.wcs.crval)),
            "cd": np.asarray(w.wcs.cd).tolist() if w.wcs.has_cd() else None,
            "pc": np.asarray(w.wcs.get_pc()).tolist(),
            "cdelt": list(map(float, w.wcs.cdelt)),
        }
        for name in ("EPSF", "PSF"):
            if name in hdul:
                e = hdul[name]
                d = e.data
                print(f"{name} shape:", None if d is None else d.shape, "dtype:", None if d is None else d.dtype)
                if d is not None and d.dtype.names:
                    print(f"{name} columns:", d.dtype.names)
                    stamps = np.array([row["EPSF"] for row in d], dtype=float)
                    print(f"{name} n_stamps:", stamps.shape[0], "stamp_shape:", stamps.shape[1:])
                    print(f"{name} finite:", np.isfinite(stamps).all(),
                          "sum_range:", float(stamps.sum(axis=(1, 2)).min()), float(stamps.sum(axis=(1, 2)).max()),
                          "min/max:", float(stamps.min()), float(stamps.max()))
                    print(f"{name} xcenter range:", float(d["XCENTER"].min()), float(d["XCENTER"].max()))
                    print(f"{name} ycenter range:", float(d["YCENTER"].min()), float(d["YCENTER"].max()))
                    print(f"{name} cwave range:", float(d["CWAVE"].min()), float(d["CWAVE"].max()))
                    print(f"{name} header:", {k: e.header[k] for k in e.header if k not in ("COMMENT", "HISTORY")})
                elif d is not None:
                    print(f"{name} finite:", np.isfinite(d).all(), "sum:", float(np.nansum(d)))
        # ZODI
        z = hdul["ZODI"].data
        print("ZODI finite:", np.isfinite(z).all(), "min/median:", np.nanmin(z), np.nanmedian(z))
    (OUT / f"{obs_id}.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    report("2025W19_1B_0116_1")
    report("2025W46_1A_0076_1")
