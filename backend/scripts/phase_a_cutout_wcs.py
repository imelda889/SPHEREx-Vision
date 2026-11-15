from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import tiles

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
BASE = (
    "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2025W19_1B/"
    "l2b-v27-2026-197/3/level2_2025W19_1B_0116_1D3_spx_l2b-v27-2026-197.fits"
)

# Field center from CRVAL, and an off-center point.
CASES = {
    "center": (134.414675682, -9.0062724739),
    "offset": (133.786245, -7.244372),
}

for name, (ra, dec) in CASES.items():
    url = tiles.build_cutout_url(BASE, ra, dec, 0.2)
    path = OUT / f"wcs_probe_{name}.fits"
    if not path.exists():
        path.write_bytes(tiles.fetch_bytes(url))
    with fits.open(path) as h:
        hd = h["IMAGE"].header
        w = WCS(hd)
        print(f"--- {name}: requested RA={ra} Dec={dec}")
        print("   NAXIS:", hd.get("NAXIS1"), hd.get("NAXIS2"))
        print("   CRPIX:", hd.get("CRPIX1"), hd.get("CRPIX2"))
        print("   CRVAL:", hd.get("CRVAL1"), hd.get("CRVAL2"))
        ny, nx = h["IMAGE"].data.shape
        ctr = w.pixel_to_world_values((nx - 1) / 2, (ny - 1) / 2)
        print("   sky at array center:", ctr)
        print("   offset from request (deg):", float(ctr[0]) - ra, float(ctr[1]) - dec)
