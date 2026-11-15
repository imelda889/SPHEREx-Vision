"""M2B PSF validation on real data: locate the EPSF zone for each cutout,
convert the 5x-oversampled stamp to native pixel scale, compare epochs."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from astropy.io import fits

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
A = OUT / "2025W19_1B_0116_1.fits"
B = OUT / "2025W46_1A_0076_1.fits"


def native_kernel(path):
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        ny, nx = h["IMAGE"].data.shape
        # Cutout centre in original 0-based detector pixels (IRSA CRPIX1A/2A convention).
        x_orig = (nx - 1) / 2.0 - hdr["CRPIX1A"]
        y_orig = (ny - 1) / 2.0 - hdr["CRPIX2A"]
        e = h["EPSF"]
        xs = np.asarray(e.data["XCENTER"], dtype=float)
        ys = np.asarray(e.data["YCENTER"], dtype=float)
        d2 = (xs - x_orig) ** 2 + (ys - y_orig) ** 2
        idx = int(np.argmin(d2))
        stamp = np.asarray(e.data["EPSF"][idx], dtype=float)
        ovx = int(e.header.get("OVSMPX", 1))
        ovy = int(e.header.get("OVSMPY", 1))
        bunit = h["IMAGE"].header.get("BUNIT")
        return dict(
            path=path.name, nx=nx, ny=ny, x_orig=x_orig, y_orig=y_orig,
            zone_index=idx, zone_center=(float(xs[idx]), float(ys[idx])),
            zone_distance=float(np.sqrt(d2[idx])), n_zones=len(xs),
            oversample=(ovx, ovy), stamp=stamp, bunit=bunit,
        )


def rebin(stamp, ovx, ovy):
    """Area-average the oversampled stamp to native detector pixels."""
    ny, nx = stamp.shape
    # Pad so both dimensions are divisible by the oversampling factor.
    py = (-ny) % ovy
    px = (-nx) % ovx
    s = np.pad(stamp, ((0, py), (0, px)))
    h, w = s.shape[0] // ovy, s.shape[1] // ovx
    s = s.reshape(h, ovy, w, ovx).sum(axis=(1, 3))
    return s / s.sum()


def fwhm(k):
    y, x = np.indices(k.shape)
    tot = k.sum()
    cx = (k * x).sum() / tot
    cy = (k * y).sum() / tot
    vx = (k * (x - cx) ** 2).sum() / tot
    vy = (k * (y - cy) ** 2).sum() / tot
    return 2.3548 * np.sqrt(vx), 2.3548 * np.sqrt(vy)


a = native_kernel(A)
b = native_kernel(B)
for label, r in (("A", a), ("B", b)):
    print(f"{label}: cutout {r['nx']}x{r['ny']}  orig_centre=({r['x_orig']:.1f},{r['y_orig']:.1f})")
    print(f"   zone idx={r['zone_index']}/{r['n_zones']} centre=({r['zone_center'][0]:.1f},{r['zone_center'][1]:.1f}) dist={r['zone_distance']:.1f}px")
    print(f"   oversample={r['oversample']}  stamp sum={r['stamp'].sum():.12f}  min={r['stamp'].min():.3e}")

ka = rebin(a["stamp"], *a["oversample"])
kb = rebin(b["stamp"], *b["oversample"])
print("\nnative kernel A shape:", ka.shape, "sum:", ka.sum())
print("native kernel B shape:", kb.shape, "sum:", kb.sum())
print("A native FWHM (px): %.3f %.3f" % fwhm(ka))
print("B native FWHM (px): %.3f %.3f" % fwhm(kb))
print("A native FWHM (arcsec @6.15\"/px): %.2f" % (fwhm(ka)[0] * 6.15))
print("kernel A vs B max abs diff: %.3e" % float(np.abs(ka - kb).max()))
print("kernel A vs B L1 diff: %.3e" % float(np.abs(ka - kb).sum()))

# Gaussian-equivalent sigma and the matching kernel that would be needed.
def sigma(k):
    y, x = np.indices(k.shape)
    tot = k.sum()
    cx, cy = (k * x).sum() / tot, (k * y).sum() / tot
    return np.sqrt(((k * (x - cx) ** 2).sum() + (k * (y - cy) ** 2).sum()) / (2 * tot))


sa, sb = sigma(ka), sigma(kb)
print("\nsigma A=%.4f B=%.4f  ratio=%.4f" % (sa, sb, max(sa, sb) / min(sa, sb)))
print("=> PSF mismatch is negligible; no PSF matching kernel is required." if abs(sa - sb) / max(sa, sb) < 0.05 else "=> PSF mismatch > 5%; matching required.")
