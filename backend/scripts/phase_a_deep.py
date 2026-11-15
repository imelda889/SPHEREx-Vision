"""M2B Phase A: deeper checks on the two real cutouts (EPSF variation, flags, WCS)."""
from __future__ import annotations

import numpy as np
from astropy.io import fits

from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
A = OUT / "2025W19_1B_0116_1.fits"
B = OUT / "2025W46_1A_0076_1.fits"


def stamps(path):
    with fits.open(path) as h:
        e = h["EPSF"].data
        return np.array([r["EPSF"] for r in e], dtype=float), e


def primary_cards(path):
    with fits.open(path) as h:
        p = h[0].header
        keep = {k: p[k] for k in p if k not in ("COMMENT", "HISTORY", "")}
        return keep


def flags_header(path):
    with fits.open(path) as h:
        f = h["FLAGS"].header
        return {k: f[k] for k in f if k not in ("COMMENT", "HISTORY", "")}


sa, ea = stamps(A)
sb, eb = stamps(B)
print("A stamps:", sa.shape, "B stamps:", sb.shape)
print("A within-file per-pixel std (mean):", float(sa.std(axis=0).mean()))
print("A stamp-to-stamp max abs diff:", float(np.abs(sa - sa[0]).max()))
print("A vs B max abs diff:", float(np.abs(sa - sb).max()))
print("A vs B mean abs diff:", float(np.abs(sa - sb).mean()))
print("A stamp0 sum:", float(sa[0].sum()), "B stamp0 sum:", float(sb[0].sum()))

# Effective PSF width (second moment) of stamp 0 and of the median stamp.
def fwhm(stamp):
    y, x = np.indices(stamp.shape)
    s = stamp.sum()
    cx = (stamp * x).sum() / s
    cy = (stamp * y).sum() / s
    vx = (stamp * (x - cx) ** 2).sum() / s
    vy = (stamp * (y - cy) ** 2).sum() / s
    return 2.3548 * np.sqrt(vx), 2.3548 * np.sqrt(vy)

print("A stamp0 FWHM (px):", fwhm(sa[0]))
print("B stamp0 FWHM (px):", fwhm(sb[0]))
print("A median-stamp FWHM:", fwhm(np.median(sa, axis=0)))

print("\nPRIMARY header A:")
for k, v in primary_cards(A).items():
    print(" ", k, "=", v)

print("\nFLAGS header A:")
for k, v in flags_header(A).items():
    print(" ", k, "=", v)

# SIP?
for label, p in (("A", A), ("B", B)):
    with fits.open(p) as h:
        hdr = h["IMAGE"].header
        sip = [k for k in hdr if k.startswith(("A_", "B_", "AP_", "BP_"))]
        print(f"\n{label} SIP keys:", sip[:6], "... n=", len(sip))
        print(f"{label} CTYPE:", hdr.get("CTYPE1"), hdr.get("CTYPE2"))
        print(f"{label} NAXIS:", hdr.get("NAXIS1"), hdr.get("NAXIS2"))
        print(f"{label} CRPIX:", hdr.get("CRPIX1"), hdr.get("CRPIX2"))
        print(f"{label} CRVAL:", hdr.get("CRVAL1"), hdr.get("CRVAL2"))
        print(f"{label} BUNIT:", hdr.get("BUNIT"))
        print(f"{label} IMAGE stats: min={np.nanmin(h['IMAGE'].data):.4f} med={np.nanmedian(h['IMAGE'].data):.4f} max={np.nanmax(h['IMAGE'].data):.4f}")
        print(f"{label} VARIANCE med={np.nanmedian(h['VARIANCE'].data):.6g}")
        print(f"{label} ZODI med={np.nanmedian(h['ZODI'].data):.4f}")
