"""PSF shape diagnostics: core FWHM from the radial profile + Gaussian-match validation."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from astropy.io import fits

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


def radial(k):
    ny, nx = k.shape
    cy, cx = (ny - 1) / 2, (nx - 1) / 2
    y, x = np.indices(k.shape)
    r = np.hypot(x - cx, y - cy)
    rb = np.arange(0, r.max() + 0.5, 0.5)
    prof = []
    for lo in rb[:-1]:
        m = (r >= lo) & (r < lo + 0.5)
        prof.append(k[m].mean() if m.any() else 0.0)
    return rb[:-1], np.array(prof)


def core_fwhm(k):
    rb, p = radial(k)
    peak = p.max()
    half = peak / 2
    for i in range(1, len(p)):
        if p[i] <= half:
            f = (p[i - 1] - half) / (p[i - 1] - p[i])
            return 2 * (rb[i - 1] + f * 0.5)
    return float("nan")


def gauss_kernel(sigma):
    n = int(np.ceil(sigma * 4)) * 2 + 1
    y, x = np.indices((n, n))
    c = (n - 1) / 2
    k = np.exp(-((x - c) ** 2 + (y - c) ** 2) / (2 * sigma ** 2))
    return k / k.sum()


def sigma2(k):
    y, x = np.indices(k.shape)
    c = (np.array(k.shape) - 1) / 2
    tot = k.sum()
    return (((k * (x - c[1]) ** 2).sum() + (k * (y - c[0]) ** 2).sum()) / (2 * tot))


ka, kb = load_native(A), load_native(B)
print("A core FWHM: %.3f px (%.2f arcsec)" % (core_fwhm(ka), core_fwhm(ka) * 6.15))
print("B core FWHM: %.3f px (%.2f arcsec)" % (core_fwhm(kb), core_fwhm(kb) * 6.15))
sa, sb = np.sqrt(sigma2(ka)), np.sqrt(sigma2(kb))
print("second-moment sigma: A=%.4f B=%.4f" % (sa, sb))

sm = np.sqrt(max(sa, sb) ** 2 - min(sa, sb) ** 2)
print("matching kernel sigma: %.4f px" % sm)
g = gauss_kernel(sm)
print("gaussian kernel sum: %.12f  size: %d" % (g.sum(), g.shape[0]))

# Convolve B's kernel with the matching Gaussian to validate the effective PSF.
# Pad first: the 7x7 native kernel already truncates the wings, and convolving
# inside that box would silently discard the extra spread.
from astropy.convolution import convolve_fft

PAD = 25
kb_p = np.zeros((PAD, PAD))
o = (PAD - kb.shape[0]) // 2
kb_p[o:o + kb.shape[0], o:o + kb.shape[1]] = kb
kb_m = convolve_fft(kb_p, g, boundary="fill", fill_value=0.0, normalize_kernel=False)
kb_m /= kb_m.sum()
print("B after match: sigma=%.4f  eq-FWHM=%.4f px" % (np.sqrt(sigma2(kb_m)), 2.3548 * np.sqrt(sigma2(kb_m))))
print("target A:      sigma=%.4f  eq-FWHM=%.4f px" % (sa, 2.3548 * sa))
print("residual sigma mismatch: %.2f%%" % (100 * abs(np.sqrt(sigma2(kb_m)) - sa) / sa))
print("kernel sum after matching: %.12f" % kb_m.sum())
print("kernel min value: %.3e (negative values indicate numerical instability)" % kb_m.min())
