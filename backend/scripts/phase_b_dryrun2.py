"""M2B Phase B dry run v2: documented flag policy + ZODI-aware difference."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
A = OUT / "2025W19_1B_0116_1.fits"
B = OUT / "2025W46_1A_0076_1.fits"

# Official SPHEREx L2 flag bits (IRSA SPHEREx Data Explorer help, Table of flags).
BENIGN_BITS = (1 << 12) | (1 << 21)  # FULLSAMPLE, SOURCE


def bad_mask(flags: np.ndarray) -> np.ndarray:
    return (flags.astype(np.int64) & ~np.int64(BENIGN_BITS)) != 0


with fits.open(A) as ha, fits.open(B) as hb:
    ref_wcs = WCS(ha["IMAGE"].header)
    img_a = ha["IMAGE"].data.astype(float)
    var_a = ha["VARIANCE"].data.astype(float)
    zodi_a = ha["ZODI"].data.astype(float)
    flg_a = ha["FLAGS"].data
    img_b = hb["IMAGE"].data.astype(float)
    var_b = hb["VARIANCE"].data.astype(float)
    zodi_b = hb["ZODI"].data.astype(float)
    flg_b = hb["FLAGS"].data
    wcs_b = WCS(hb["IMAGE"].header)

shape = img_a.shape
img_b_r, fp = reproject_interp((img_b, wcs_b), ref_wcs, shape_out=shape)
var_b_r, _ = reproject_interp((var_b, wcs_b), ref_wcs, shape_out=shape)
zodi_b_r, _ = reproject_interp((zodi_b, wcs_b), ref_wcs, shape_out=shape)
flg_b_r, _ = reproject_interp((flg_b.astype(float), wcs_b), ref_wcs, shape_out=shape, order="nearest-neighbor")

bad_a = bad_mask(flg_a) | ~np.isfinite(img_a) | ~np.isfinite(var_a)
bad_b = bad_mask(np.nan_to_num(flg_b_r, nan=1).astype(np.int64)) | ~np.isfinite(img_b_r) | ~np.isfinite(var_b_r) | (fp <= 0)
valid = ~bad_a & ~bad_b

print("bad_a frac: %.4f  bad_b frac: %.4f  valid frac: %.4f  npix=%d" % (bad_a.mean(), bad_b.mean(), valid.mean(), valid.sum()))
print("A flags==0 or benign-only frac: %.4f" % float((~bad_mask(flg_a)).mean()))
print("B flags==0 or benign-only frac: %.4f" % float((~bad_mask(flg_b)).mean()))

# Background levels (robust, on valid pixels)
bg_a = float(np.median(img_a[valid]))
bg_b = float(np.median(img_b_r[valid]))
zg_a = float(np.median(zodi_a[valid]))
zg_b = float(np.median(zodi_b_r[valid]))
print("median IMAGE A=%.6f B=%.6f  delta=%.6f" % (bg_a, bg_b, bg_b - bg_a))
print("median ZODI  A=%.6f B=%.6f  delta=%.6f" % (zg_a, zg_b, zg_b - zg_a))

diff_raw = img_b_r - img_a
d = diff_raw[valid]
print("RAW diff: med=%.6f mean=%.6f std=%.6f" % (np.median(d), d.mean(), d.std()))

# ZODI-subtracted (documented foreground model removal, same for both epochs)
img_a_z = img_a - zodi_a
img_b_z = img_b_r - zodi_b_r
diff_z = img_b_z - img_a_z
dz = diff_z[valid]
print("ZODI-sub diff: med=%.6f mean=%.6f std=%.6f" % (np.median(dz), dz.mean(), dz.std()))

# Background-equalized (median) difference for comparison
diff_m = (img_b_r - bg_b) - (img_a - bg_a)
dm = diff_m[valid]
print("MEDIAN-sub diff: med=%.6f mean=%.6f std=%.6f" % (np.median(dm), dm.mean(), dm.std()))

noise = np.sqrt(var_a + var_b_r)
print("median noise sqrt(varA+varB): %.6f" % float(np.median(noise[valid])))
for label, dd in (("raw", d), ("zodi", dz), ("median", dm)):
    mad = 1.4826 * np.median(np.abs(dd - np.median(dd)))
    print("  %-7s robust sigma=%.6f  ratio_to_noise=%.3f" % (label, mad, mad / float(np.median(noise[valid]))))

# Diagnostic significance on the ZODI-subtracted difference
sig = np.where(valid, diff_z / np.where(noise > 0, noise, np.nan), np.nan)
print("diag significance: std=%.3f p99.9=%.3f max=%.3f" % (float(np.nanstd(sig)), float(np.nanpercentile(sig, 99.9)), float(np.nanmax(sig))))

json.dump(
    {
        "valid_frac": float(valid.mean()),
        "npix_valid": int(valid.sum()),
        "bg_a": bg_a, "bg_b": bg_b,
        "zodi_a": zg_a, "zodi_b": zg_b,
        "diff_raw": {"median": float(np.median(d)), "std": float(d.std())},
        "diff_zodi": {"median": float(np.median(dz)), "std": float(dz.std())},
        "diff_median": {"median": float(np.median(dm)), "std": float(dm.std())},
        "noise_median": float(np.median(noise[valid])),
    },
    open(OUT / "diff_stats_v2.json", "w"),
    indent=2,
)
print("wrote diff_stats_v2.json")
