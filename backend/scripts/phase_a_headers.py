from __future__ import annotations

from pathlib import Path

from astropy.io import fits

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"

for f in ("2025W19_1B_0116_1.fits", "2025W46_1A_0076_1.fits"):
    print("===", f)
    with fits.open(OUT / f) as h:
        for n in ("IMAGE", "FLAGS", "VARIANCE", "ZODI", "EPSF"):
            hd = h[n].header
            extra = {k: hd[k] for k in hd if k.upper().startswith(("CRPIX", "CTYPE", "CUNIT", "BUNIT", "OVSMP", "DETECTOR"))}
            print(" ", n, extra)
        print("  EPSF XCTR keys:", [k for k in h["EPSF"].header if k.upper().startswith("XCTR")][:3], "count=", len([k for k in h["EPSF"].header if k.upper().startswith("XCTR")]))
        print("  IMAGE header cards sample:")
        for c in h["IMAGE"].header.cards:
            if c.keyword in ("COMMENT", "HISTORY"):
                print("    ", c.keyword, c.value)
