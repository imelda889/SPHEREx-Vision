from __future__ import annotations

import collections
from pathlib import Path

import numpy as np
from astropy.io import fits

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"

for f in ("2025W19_1B_0116_1.fits", "2025W46_1A_0076_1.fits"):
    print("===", f)
    with fits.open(OUT / f) as h:
        print("-- FLAGS header COMMENT/HISTORY --")
        for card in h["FLAGS"].header.cards:
            if card.keyword in ("COMMENT", "HISTORY"):
                print("  ", card.keyword, ":", card.value)
        fl = h["FLAGS"].data.astype(np.int64)
        bits = collections.Counter()
        for b in range(31):
            m = (fl & np.int64(1 << b)) != 0
            if m.any():
                bits[b] = int(m.sum())
        print("-- set bits (bit: count, frac) --")
        for b, c in sorted(bits.items()):
            print("   bit %2d (value %10d): %6d px  %.3f" % (b, 1 << b, c, c / fl.size))
        print("-- raw unique values (top 12) --")
        vals, counts = np.unique(fl, return_counts=True)
        order = np.argsort(-counts)[:12]
        for i in order:
            print("   %10d : %6d" % (int(vals[i]), int(counts[i])))
