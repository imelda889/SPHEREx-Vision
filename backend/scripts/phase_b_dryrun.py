"""M2B Phase B dry run on real data: reproject, mask, difference, stats."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

OUT = Path(__file__).resolve().parents[1] / "work" / "m2b"
A = OUT / "2025W19_1B_0116_1.fits"  # earlier
B = OUT / "2025W46_1A_0076_1.fits"  # later

with fits.open(A) as ha, fits.open(B) as hb:
    ref_wcs = WCS(ha["IMAGE"].header)
    img_a = ha["IMAGE"].data.astype(float)
    var_a = ha["VARIANCE"].data.astype(float)
    flg_a = ha["FLAGS"].data.astype(np.int64)
    img_b = hb["IMAGE"].data.astype(float)
    var_b = hb["VARIANCE"].data.astype(float)
    flg_b = hb["FLAGS"].data.astype(np.int64)
    wcs_b = WCS(hb["IMAGE"].header)

shape_out = img_a.shape

img_b_r, fp_b = reproject_interp((img_b, wcs_b), ref_wcs, shape_out=shape_out)
var_b_r, _ = reproject_interp((var_b, wcs_b), ref_wcs, shape_out=shape_out)
flg_b_r, _ = reproject_interp((flg_b.astype(float), wcs_b), ref_wcs, shape_out=shape_out, order="nearest-neighbor")

print("ref shape:", shape_out)
print("reprojected B footprint valid frac:", float(np.isfinite(fp_b).mean()), "mean fp:", float(np.nanmean(fp_b)))
print("A finite frac:", float(np.isfinite(img_a).mean()))
print("B_r finite frac:", float(np.isfinite(img_b_r).mean()))

# Masks
bad_a = ~np.isfinite(img_a) | (flg_a != 0)
bad_b = ~np.isfinite(img_b_r) | (flg_b_r != 0) | ~np.isfinite(fp_b) | (fp_b <= 0)
valid = ~bad_a & ~bad_b
print("valid overlap frac:", float(valid.mean()), "npix:", int(valid.sum()))
print("bad A frac:", float(bad_a.mean()), "bad B frac:", float(bad_b.mean()))

med_a = float(np.nanmedian(img_a[valid]))
med_b = float(np.nanmedian(img_b_r[valid]))
print("median A:", med_a, "median B:", med_b, "delta:", med_b - med_a)

diff_raw = img_b_r - img_a
d = diff_raw[valid]
print("diff_raw valid: mean=%.6g med=%.6g std=%.6g min=%.4g max=%.4g" % (d.mean(), np.median(d), d.std(), d.min(), d.max()))

diff_bg = (img_b_r - med_b) - (img_a - med_a)
db = diff_bg[valid]
print("diff_bg  valid: mean=%.6g med=%.6g std=%.6g min=%.4g max=%.4g" % (db.mean(), np.median(db), db.std(), db.min(), db.max()))

noise = np.sqrt(var_a + var_b_r)
sig = np.where(valid, diff_bg / np.where(noise > 0, noise, np.nan), np.nan)
print("diag significance: std=%.3f p99.9=%.3f max=%.3f" % (float(np.nanstd(sig)), float(np.nanpercentile(sig, 99.9)), float(np.nanmax(sig))))

# Robust spread of the difference vs sqrt(var) to check noise consistency.
mad = 1.4826 * np.median(np.abs(db - np.median(db)))
print("robust diff sigma: %.6g   median sqrt(varA+varB): %.6g" % (mad, float(np.nanmedian(noise[valid]))))

json.dump(
    {
        "shape": list(shape_out),
        "valid_frac": float(valid.mean()),
        "bad_a_frac": float(bad_a.mean()),
        "bad_b_frac": float(bad_b.mean()),
        "median_a": med_a,
        "median_b": med_b,
        "diff_raw": {"mean": float(d.mean()), "median": float(np.median(d)), "std": float(d.std()), "min": float(d.min()), "max": float(d.max())},
        "diff_bg": {"mean": float(db.mean()), "median": float(np.median(db)), "std": float(db.std()), "min": float(db.min()), "max": float(db.max())},
        "robust_sigma": float(mad),
        "median_noise": float(np.nanmedian(noise[valid])),
    },
    open(OUT / "diff_stats.json", "w"),
    indent=2,
)
print("wrote", OUT / "diff_stats.json")
