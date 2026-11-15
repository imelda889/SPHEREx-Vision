from __future__ import annotations

import collections
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"

for f in ("2025W19_1B_0116_1.fits", "2025W46_1A_0076_1.fits"):
    print("===", f)
    with fits.open(OUT / f) as h:
        for n in ("IMAGE", "FLAGS", "VARIANCE", "ZODI"):
            hd = h[n].header
            print(
                "  %-9s CRPIX=(%s,%s) CRVAL=(%s,%s) CTYPE=%s"
                % (n, hd.get("CRPIX1"), hd.get("CRPIX2"), hd.get("CRVAL1"), hd.get("CRVAL2"), hd.get("CTYPE1"))
            )
        w = WCS(h["IMAGE"].header)
        print("  IMAGE has_celestial:", w.has_celestial)
        print("  center sky:", w.pixel_to_world_values(58.5, 58.5))
        print("  corner (0,0):", w.pixel_to_world_values(0, 0))
        print("  corner (116,116):", w.pixel_to_world_values(116, 116))
        print("  SIP:", w.sip is not None)
        if w.sip is not None:
            print("  sip order:", w.sip.a_order, w.sip.b_order, w.sip.ap_order, w.sip.bp_order)
        print("  BUNIT:", h["IMAGE"].header.get("BUNIT"), " EXPTIME:", h["IMAGE"].header.get("EXPTIME"))
        print(
            "  IMAGE med/min/max: %.4f %.4f %.4f"
            % (np.nanmedian(h["IMAGE"].data), np.nanmin(h["IMAGE"].data), np.nanmax(h["IMAGE"].data))
        )
        fl = h["FLAGS"].data
        print("  FLAGS nonzero frac:", float((fl != 0).mean()))
        bits = collections.Counter()
        for b in range(32):
            m = (fl & (1 << b)) != 0
            if m.any():
                bits[1 << b] = int(m.sum())
        print("  flag bit counts:", dict(sorted(bits.items())))
