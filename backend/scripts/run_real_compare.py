"""Run the real M2B pipeline end-to-end against two live DR1 observations."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import compare, sia  # noqa: E402

RA, DEC, SIZE = 133.786245, -7.244372, 0.2
COLL = "spherex_dr1"

rows = sia.query_sia(COLL, RA, DEC, 0.05)
by_key = {(str(r["obs_id"]), r["band"]): r for r in rows if r.get("access_url")}
a = by_key[("2025W19_1B_0116_1", 3)]
b = by_key[("2025W46_1A_0076_1", 3)]
print("pair:", a["obs_id"], a["band"], a["t_min_mjd"], "|", b["obs_id"], b["band"], b["t_min_mjd"])

res = compare.run_comparison(a, b, RA, DEC, SIZE, COLL)
print(json.dumps({k: v for k, v in res.items() if k not in ("observations",)}, indent=2)[:4000])
print("\n--- observations ---")
print(json.dumps(res["observations"], indent=2)[:2500])
