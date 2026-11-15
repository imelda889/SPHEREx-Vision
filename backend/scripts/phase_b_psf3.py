"""Validate a pixel-integrated Gaussian matching kernel at native sampling."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.convolution import convolve_fft
from scipy.special import erf

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
A = OUT / "2025W19_1B_0116_1.fits"
B = OUT / "2025W46_1A_0076_1.fits"


def load_native(path):
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        ny, nx = h["IMAGE"].data.shape
        xo = (nx - 1) / 2 - hdr["CRPIX1A"]
        yo = (ny - 1) / 2 - hdr["CRPIX2A"]
        e = h["EPSF"]
        xs = np.asarray(e.data["XCENTER"], float)
        ys = np.asarray(e.data["YCENTER"], float)
        i = int(np.argmin((xs - xo) ** 2 + (ys - yo) ** 2))
        s = np.asarray(e.data["EPSF"][i], float)
        ov = int(e.header["OVSMPX"])
        py, px = (-s.shape[0]) % ov, (-s.shape[1]) % ov
        s = np.pad(s, ((0, py), (0, px)))
        k = s.reshape(s.shape[0] // ov, ov, s.shape[1] // ov, ov).sum(axis=(1, 3))
        k /= k.sum()
        return k


def sigma2(k):
    y, x = np.indices(k.shape)
    c = (np.array(k.shape) - 1) / 2
    tot = k.sum()
    return ((k * (x - c[1]) ** 2).sum() + (k * (y - c[0]) ** 2).sum()) / (2 * tot)


def gauss_kernel_integrated(sigma, half=3):
    """Pixel-area-integrated circular Gaussian on a (2*half+1)^2 grid."""
    n = 2 * half + 1
    c = half
    k = np.zeros((n, n))
    s2 = sigma * np.sqrt(2)
    for i in range(n):
        for j in range(n):
            x0, x1 = j - c - 0.5, j - c + 0.5
            y0, y1 = i - c - 0.5, i - c + 0.5
            fx = 0.5 * (erf(x1 / s2) - erf(x0 / s2))
            fy = 0.5 * (erf(y1 / s2) - erf(y0 / s2))
            k[i, j] = fx * fy
    return k / k.sum()


ka, kb = load_native(A), load_native(B)
sa, sb = np.sqrt(sigma2(ka)), np.sqrt(sigma2(kb))
print("PSF sigma: A=%.4f B=%.4f  (ratio %.4f)" % (sa, sb, sa / sb))
sm = np.sqrt(sa ** 2 - sb ** 2)
print("required matching sigma: %.4f native px" % sm)

for half in (2, 3):
    g = gauss_kernel_integrated(sm, half)
    print("\nhalf=%d  kernel %dx%d sum=%.12f  discrete sigma=%.4f (target %.4f)" % (half, g.shape[0], g.shape[1], g.sum(), np.sqrt(sigma2(g)), sm))

g = gauss_kernel_integrated(sm, 2)
PAD = 31
kb_p = np.zeros((PAD, PAD))
o = (PAD - kb.shape[0]) // 2
kb_p[o:o + kb.shape[0], o:o + kb.shape[1]] = kb
kb_m = convolve_fft(kb_p, g, boundary="fill", fill_value=0.0, normalize_kernel=False)
kb_m /= kb_m.sum()
sm_eff = np.sqrt(sigma2(kb_m))
print("\neffective PSF after matching: sigma=%.4f  (target %.4f)" % (sm_eff, sa))
print("residual sigma mismatch: %.2f%%" % (100 * abs(sm_eff - sa) / sa))
print("kernel min: %.3e  sum: %.12f" % (g.min(), g.sum()))
