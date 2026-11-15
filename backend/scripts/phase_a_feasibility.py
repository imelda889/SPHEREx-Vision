"""M2B Phase A: real-data feasibility probe (read-only).

Reads a cached SIA2 VOTable dump and reports which real DR1 observations cover
a target sky position, grouped by band and epoch. No synthetic data or
invented metadata.

Usage:
    python scripts/phase_a_feasibility.py [--ra R] [--dec D] [--band D3] [--cache JSON_PATH]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_CACHE = Path(__file__).resolve().parents[1] / "cache" / "sia_dr1.json"


def load_rows(path: Path) -> list[dict]:
    doc = json.loads(path.read_text(encoding="utf-8"))
    tbl = doc["VOTABLE"]["RESOURCE_ARRAY"][1]["TABLE"]
    names = [f.get("<xmlattr>", {}).get("name") for f in tbl["FIELD_ARRAY"]]
    return [dict(zip(names, r)) for r in tbl["DATA"]["TABLEDATA"]]


def polygon_from_s_region(s_region: str) -> list[tuple[float, float]]:
    """Parse 'POLYGON ICRS ra dec ra dec ...' into a list of vertices."""
    parts = s_region.split()
    if not parts or parts[0].upper() != "POLYGON":
        return []
    if parts[1].upper() == "ICRS":
        parts = parts[2:]
    else:
        parts = parts[1:]
    nums = [float(x) for x in parts]
    return list(zip(nums[0::2], nums[1::2]))


def point_in_polygon(ra: float, dec: float, poly: list[tuple[float, float]]) -> bool:
    """Ray casting in the tangent plane, adequate for small SIA footprints."""
    if len(poly) < 3:
        return False
    # De-duplicate a repeated closing vertex.
    if poly[0] == poly[-1]:
        poly = poly[:-1]
    # Local gnomonic-ish projection around the polygon centroid.
    ra0 = sum(p[0] for p in poly) / len(poly)
    dec0 = sum(p[1] for p in poly) / len(poly)
    import math

    cosd = math.cos(math.radians(dec0))

    def proj(lon: float, lat: float) -> tuple[float, float]:
        return ((lon - ra0) * cosd, lat - dec0)

    pts = [proj(p[0], p[1]) for p in poly]
    x, y = proj(ra, dec)
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y):
            x_cross = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_cross:
                inside = not inside
        j = i
    return inside


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra", type=float, default=133.786245)
    ap.add_argument("--dec", type=float, default=-7.244372)
    ap.add_argument("--band", default=None)
    ap.add_argument(
        "--cache",
        default=str(DEFAULT_CACHE),
        help=f"path to a cached SIA2 VOTable JSON dump (default: {DEFAULT_CACHE})",
    )
    args = ap.parse_args()

    rows = load_rows(Path(args.cache))
    print(f"cached rows: {len(rows)}")

    covering = []
    for r in rows:
        try:
            poly = polygon_from_s_region(str(r.get("s_region") or ""))
        except Exception:
            continue
        if point_in_polygon(args.ra, args.dec, poly):
            covering.append(r)

    print(f"rows whose s_region covers RA={args.ra} Dec={args.dec}: {len(covering)}")

    by_band: dict[str, list[dict]] = defaultdict(list)
    for r in covering:
        by_band[str(r.get("energy_bandpassname"))].append(r)

    for band in sorted(by_band):
        if args.band and band != args.band:
            continue
        rs = by_band[band]
        obs = {}
        for r in rs:
            oid = str(r.get("obs_id"))
            if oid not in obs:
                obs[oid] = r
        epochs = sorted({float(o["t_min"]) for o in obs.values()})
        print(f"\n{band}: covering_rows={len(rs)} distinct_obs={len(obs)} distinct_t_min={len(epochs)}")
        print(f"  t_min span: {epochs[0]:.5f} .. {epochs[-1]:.5f} MJD")
        for oid, r in sorted(obs.items(), key=lambda kv: float(kv[1]["t_min"]))[:20]:
            print(
                f"  {oid:24s} det={str(r.get('energy_bandpassname')).split('-D')[-1]:2s} "
                f"t_min={float(r['t_min']):.5f} t_max={float(r['t_max']):.5f} "
                f"px={r.get('s_xel1')}x{r.get('s_xel2')} scale={r.get('s_pixel_scale')} "
                f"fov={r.get('s_fov')} size={r.get('access_estsize')}KB"
            )

    # Candidate pairs: same band, same detector, different t_min, both covering.
    print("\n--- candidate same-band different-epoch pairs ---")
    found = 0
    for band, rs in sorted(by_band.items()):
        if args.band and band != args.band:
            continue
        obs: dict[str, dict] = {}
        for r in rs:
            obs.setdefault(str(r.get("obs_id")), r)
        ordered = sorted(obs.values(), key=lambda r: float(r["t_min"]))
        for i in range(len(ordered)):
            for j in range(i + 1, len(ordered)):
                a, b = ordered[i], ordered[j]
                if abs(float(a["t_min"]) - float(b["t_min"])) < 1e-6:
                    continue
                print(
                    f"{band}  {a['obs_id']} (t={float(a['t_min']):.4f})  vs  "
                    f"{b['obs_id']} (t={float(b['t_min']):.4f})  "
                    f"dt={float(b['t_min']) - float(a['t_min']):.3f}d"
                )
                found += 1
                if found >= 12:
                    return 0
    if not found:
        print("NONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
