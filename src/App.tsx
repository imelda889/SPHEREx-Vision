import { useEffect, useRef, useState, type ReactNode } from "react";
import { AladinSky } from "./AladinSky";
import { SpherexAllSky } from "./SpherexAllSky";
import { SpherexGlobe3D } from "./SpherexGlobe3D";
import type { AladinInstance } from "aladin-lite";

type IconName =
  | "aperture"
  | "home"
  | "sky"
  | "compare"
  | "activity"
  | "objects"
  | "learn"
  | "settings"
  | "search"
  | "crosshair"
  | "plus"
  | "minus"
  | "layers"
  | "camera"
  | "expand"
  | "chevron"
  | "calendar"
  | "info"
  | "sparkle"
  | "panel"
  | "arrow"
  | "refresh";

const paths: Record<IconName, ReactNode> = {
  aperture: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 3.5 9.4 9M20.5 12 14.6 9.5M12 20.5l2.4-5.7M3.5 12l5.7 2.5" />
    </>
  ),
  sky: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.7 11h16.6M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.7 8.6 8.7 12s1.1 6.2 3.3 8.5" />
    </>
  ),
  home: (
    <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></>
  ),
  activity: (
    <><path d="M3 12h4l3-8 4 16 3-8h4" /></>
  ),
  compare: (
    <>
      <rect x="3.5" y="5" width="7" height="14" rx="1.5" />
      <rect x="13.5" y="5" width="7" height="14" rx="1.5" />
      <path d="M7 9v6M17 9v6" />
    </>
  ),
  objects: (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="16.5" cy="15.5" r="4" />
      <path d="m10.5 10.5 3 2.5M18.6 6.5l.5-1.5.5 1.5 1.4.5-1.4.5-.5 1.5-.5-1.5-1.4-.5 1.4-.5Z" />
    </>
  ),
  learn: (
    <>
      <path d="M4 5.5c3.4-.8 6.1-.3 8 1.5v12c-1.9-1.8-4.6-2.3-8-1.5v-12ZM20 5.5c-3.4-.8-6.1-.3-8 1.5v12c1.9-1.8 4.6-2.3 8-1.5v-12Z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.3 15.3 4.2 4.2" /></>,
  crosshair: <><circle cx="12" cy="12" r="5" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 7l1.5-2.5h5L16 7" /></>,
  expand: <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />,
  chevron: <path d="m9 7 5 5-5 5" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.2" /></>,
  sparkle: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9 12 3.5Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1 -2.64 -6.36" /><path d="M21 3v7h-7" /></>,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {paths[name]}
      </g>
    </svg>
  );
}

function StatusBadge({
  compact = false,
  state,
  text,
}: {
  compact?: boolean;
  state?: "idle" | "checking" | "ok" | "error";
  text?: string;
}) {
  const dot =
    state === "ok"
      ? "#5fd68a"
      : state === "error"
        ? "#e07a6a"
        : state === "checking"
          ? "#e7b96a"
          : "#8a93a6";
  return (
    <span className={`status-badge${compact ? " status-badge--compact" : ""}`}>
      <span className="status-dot" style={{ background: dot }} />
      {text ?? "Status not checked"}
    </span>
  );
}

function backendBadgeText(state: "idle" | "checking" | "ok" | "error"): string {
  if (state === "checking") return "Checking backend…";
  if (state === "ok") return "Backend reachable";
  if (state === "error") return "Backend unreachable";
  return "Backend not checked";
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`nav-item${active ? " nav-item--active" : ""}`} onClick={onClick}>
      <Icon name={icon} size={19} />
      <span>{label}</span>
      {active && <span className="nav-marker" />}
    </button>
  );
}

function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: IconName;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button className="icon-button" title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

type SkyFootprint =
  | { kind: "polygon"; vertices: Array<[number, number]> }
  | { kind: "circle"; center: [number, number]; radius_deg: number };

type RegionSearchErrorKind = "temporary" | "invalid" | "other";

class RegionSearchHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: string,
  ) {
    super(detail ?? `HTTP ${status}`);
    this.name = "RegionSearchHttpError";
  }
}

function getApiErrorDetail(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("detail" in payload)) return undefined;
  const detail = payload.detail;
  if (typeof detail === "string") return detail;
  if (!Array.isArray(detail)) return undefined;
  const messages = detail.flatMap((item) => {
    if (typeof item !== "object" || item === null || !("msg" in item)) return [];
    return typeof item.msg === "string" ? [item.msg] : [];
  });
  return messages.length > 0 ? messages.join("; ") : undefined;
}

function describeRegionSearchError(error: unknown): {
  kind: RegionSearchErrorKind;
  message: string;
} {
  if (error instanceof RegionSearchHttpError) {
    if (error.status === 422) {
      return {
        kind: "invalid",
        message: error.detail
          ? `Invalid search parameters: ${error.detail}`
          : "Invalid search parameters. Check the RA, Dec, radius, and collection.",
      };
    }
    if (
      error.status === 503 ||
      /IRSA SIA is temporarily unavailable/i.test(error.detail ?? "")
    ) {
      return {
        kind: "temporary",
        message: "IRSA is temporarily unavailable. Your selected region is unchanged; retry the search.",
      };
    }
    return {
      kind: "other",
      message: error.detail
        ? `Search failed (HTTP ${error.status}): ${error.detail}`
        : `Search failed (HTTP ${error.status}).`,
    };
  }
  if (error instanceof TypeError && /fetch/i.test(error.message)) {
    return {
      kind: "other",
      message: "Could not reach the backend. Check that it is running and try again.",
    };
  }
  return {
    kind: "other",
    message: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/** Defensive client-side mirror of the backend STCS parsing. Never throws. */
function normalizeFootprint(raw: unknown): SkyFootprint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === "polygon" && Array.isArray(r.vertices)) {
    const verts: Array<[number, number]> = [];
    for (const v of r.vertices) {
      if (!Array.isArray(v) || v.length < 2) return null;
      const lon = Number(v[0]);
      const lat = Number(v[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
      verts.push([lon, lat]);
    }
    return verts.length >= 3 ? { kind: "polygon", vertices: verts } : null;
  }
  if (r.kind === "circle" && Array.isArray(r.center) && r.center.length >= 2) {
    const lon = Number(r.center[0]);
    const lat = Number(r.center[1]);
    const rad = Number((r as Record<string, unknown>).radius_deg);
    if (![lon, lat, rad].every(Number.isFinite) || lat < -90 || lat > 90 || rad <= 0) return null;
    return { kind: "circle", center: [lon, lat], radius_deg: rad };
  }
  return null;
}

// ---------------------------------------------------------------------------
// M2B: real temporal comparison types (mirror the backend response exactly).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

type CmpObs = {
  obs_id: string;
  band: number | null;
  detector: number | null;
  t_min_mjd: number | null;
  t_max_mjd: number | null;
  obs_date_utc: string | null;
  access_format: string | null;
  has_access: boolean;
  s_fov_deg: number | null;
};

type CmpBand = {
  band: number | null;
  detector: number | null;
  n_observations: number;
  observations: CmpObs[];
};

type CmpPair = {
  obs_id_earlier: string;
  obs_id_later: string;
  band: number | null;
  dt_days: number;
};

type CmpPsfFrame = {
  status: string;
  hdu?: string;
  zone_index?: number;
  n_zones?: number;
  zone_distance_px?: number;
  oversampling?: number[];
  kernel_shape?: number[];
  sigma_px?: number;
  eq_fwhm_px?: number;
  detail?: string;
} | null;

type CmpFrame = {
  obs_id: string | null;
  collection: string | null;
  band: number | null;
  detector: number | null;
  t_min_mjd: number | null;
  t_max_mjd: number | null;
  obs_date_utc: string | null;
  em_min_m: number | null;
  em_max_m: number | null;
  s_fov_deg: number | null;
  access_format: string | null;
  shape: number[];
  unit: string | null;
  wcs_valid: boolean;
  finite_fraction: number;
  hdu_names: string[];
  flag_counts: Record<string, number>;
  psf: CmpPsfFrame;
  warnings: string[];
};

type CmpStats = {
  n_pixels: number;
  median: number;
  mean: number;
  std: number;
  robust_sigma: number;
  min: number;
  max: number;
};

type CmpResult = {
  job_id: string;
  pipeline_version: string;
  region: { ra: number; dec: number; size_deg: number; collection: string };
  observations: { earlier: CmpFrame; later: CmpFrame };
  epoch_separation_days: number | null;
  difference: {
    convention: string;
    background: {
      a_median: number | null;
      b_median: number | null;
      zodi_a_median: number | null;
      zodi_b_median: number | null;
      delta_median?: number;
      delta_zodi?: number;
    };
    stats_raw: CmpStats | null;
    stats_zodi_subtracted: CmpStats | null;
    significance_stats: {
      label: string;
      std: number;
      robust_sigma: number;
      p999: number;
      max: number;
      min: number;
      note: string;
    } | null;
    noise_median: number | null;
    valid_fraction: number;
    display_limits: { vmin: number; vmax: number; basis: string } | null;
  };
  alignment: {
    method: string;
    reference: string;
    reference_shape: number[];
    coverage_fraction: number;
    note: string;
  };
  psf: {
    status: string;
    policy: string;
    detail?: string;
    sigma_a_px?: number;
    sigma_b_px?: number;
    ratio?: number;
    matching_sigma_px?: number;
    matching_kernel_shape?: number[];
    sigma_after_px?: number;
    residual_sigma_fraction?: number;
    target?: string;
    match_a: boolean;
    match_b: boolean;
  };
  masks: {
    policy: string;
    benign_bits: number[];
    masking_bits: number[];
    source: string;
    valid_fraction: number;
  };
  warnings: string[];
  images: {
    earlier: string;
    later: string;
    difference: string | null;
    difference_raw: string | null;
    significance: string | null;
  };
  provenance: {
    sia_query: { collection: string; ra: number; dec: number; size_deg: number };
    cutout_size_deg: number;
    source: string;
    hdu_resolution: string;
    min_epoch_separation_days: number;
  };
};

function fmtNum(value: number | null | undefined, digits = 4): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}

// ---------------------------------------------------------------------------
// M2C: candidate residual detection types (mirror the backend response).
// ---------------------------------------------------------------------------

type CandJob = {
  job_id: string;
  obs_earlier: string | null;
  obs_later: string | null;
  band: number | null;
  epoch_separation_days: number | null;
  valid_fraction: number | null;
  has_products: boolean;
  has_detection: boolean;
};

type CandCandidate = {
  id: string;
  sign: "positive" | "negative";
  x_pix: number | null;
  y_pix: number | null;
  ra_deg: number | null;
  dec_deg: number | null;
  coord_null_reason: string | null;
  peak_diff: number;
  peak_stat: number;
  detection_statistic: number;
  flux_sum: number | null;
  flux_null_reason: string | null;
  background: number | null;
  background_rms: number | null;
  noise_local: number | null;
  npix: number;
  boundary_dist_pix: number | null;
  local_coverage: number;
  quality_flags: string[];
  unit: string | null;
  obs_earlier: string | null;
  obs_later: string | null;
  band: number | null;
  detector: number | null;
  mjd_earlier: number | null;
  mjd_later: number | null;
  date_earlier: string | null;
  date_later: string | null;
  compare_job_id: string;
};

type CandResult = {
  job_id: string;
  compare_job_id: string;
  detection_version: string;
  products_version: string | null;
  pipeline_version: string;
  parameters: {
    threshold_sigma: number;
    min_area: number;
    deblend: boolean;
    difference_source: string | null;
    unit: string | null;
    shape: number[] | null;
  };
  method: {
    background: { median: number | null; rms: number | null; method: string; n: number };
    noise: string;
    statistic: string;
    segmentation: string;
    mask: string;
    edge_policy: string;
    correlated_noise: string;
  };
  counts: {
    positive: number;
    negative: number;
    total: number;
    rejected_edge: number;
    n_valid_pixels: number;
  };
  candidates: CandCandidate[];
  provenance: {
    observations: { earlier: CmpFrame; later: CmpFrame } | null;
    region: { ra: number; dec: number; size_deg: number; collection: string } | null;
    epoch_separation_days: number | null;
    psf: CmpResult["psf"] | null;
    masks: { policy: string } | null;
    difference_convention: string | null;
    compare_warnings: string[];
    images: { earlier: string; later: string; difference: string | null; difference_raw: string | null; significance: string | null };
  };
  warnings: string[];
  generated_utc: string;
};

function fmtSci(value: number | null | undefined, digits = 3): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toExponential(digits) : "—";
}

function fmtDate(iso: string | null | undefined): string {
  return iso ? iso.replace("T", " ").replace(/\.\d+$/, "") : "—";
}

function fmtWavelength(lo: number | null | undefined, hi: number | null | undefined): string {
  if (typeof lo !== "number" || typeof hi !== "number") return "—";
  return `${(lo * 1e6).toFixed(3)} – ${(hi * 1e6).toFixed(3)} µm`;
}

const pageMeta: Record<string, { crumb: string; title: string }> = {
  Home: { crumb: "Home", title: "Mission dashboard" },
  "Explore sky": { crumb: "Explore sky", title: "Sky explorer" },
  "Compare observations": { crumb: "Compare observations", title: "Compare observations" },
  "Change Detection": { crumb: "Change Detection", title: "Change Detection" },
  "Candidate objects": { crumb: "Candidate objects", title: "Candidate objects" },
  Learn: { crumb: "Learn", title: "Learn" },
};

function App() {
  const [activeNav, setActiveNav] = useState("Home");
  const [navOpen, setNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(32);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [compareLayout, setCompareLayout] = useState<"side" | "slider">("side");
  const [sliderPos, setSliderPos] = useState(50);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camMsg, setCamMsg] = useState("");
  const [layers, setLayers] = useState({ grid: true, labels: true, arcs: true });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevRef = useRef<{ data: Uint8ClampedArray } | null>(null);
  const trackRef = useRef<{ cx: number; cy: number; spread: number } | null>(null);
  const lastZoomRef = useRef(0);
  const [camGesture, setCamGesture] = useState("");
  const [tile, setTile] = useState<null | {
    url: string;
    obs_id: string | null;
    detector: number | null;
    band: number | null;
    shape: number[];
    unit: string;
    center: number[] | null;
  }>(null);
  const [tileStatus, setTileStatus] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [regionRa, setRegionRa] = useState("133.786245");
  const [regionDec, setRegionDec] = useState("-7.244372");
  const [regionRadius, setRegionRadius] = useState("0.05");
  const [regionMsg, setRegionMsg] = useState("");
  const [regionErrorKind, setRegionErrorKind] = useState<RegionSearchErrorKind | null>(null);
  const [obsList, setObsList] = useState<Array<{
    obs_id: string;
    detector: number | null;
    band: number | null;
    t_min_mjd: number | null;
    t_max_mjd: number | null;
    access_format: string | null;
    has_access: boolean;
    footprint: SkyFootprint | null;
  }>>([]);
  const [obsStatus, setObsStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [selectedObs, setSelectedObs] = useState<string | null>(null);
  const [regionSummary, setRegionSummary] = useState<{ ra: number; dec: number; radius: number; n_obs: number } | null>(null);

  // Interactive All-Sky Explorer (Aladin Lite v3 + HiPS). The shared sky
  // selection {ra, dec, radius} IS the region inputs above: map, inputs and
  // camera all read and write the same state, and one search function runs.
  const aladinHostRef = useRef<HTMLDivElement | null>(null);
  const [aladinState, setAladinState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [aladinError, setAladinError] = useState("");
  const [skySurvey, setSkySurvey] = useState<"CDS/P/2MASS/color" | "CDS/P/DSS2/color">("CDS/P/2MASS/color");
  const [skySurveyBusy, setSkySurveyBusy] = useState(false);
  const [skyViewMode, setSkyViewMode] = useState<"globe" | "spherex" | "coverage">("globe");
  const [hipsLive, setHipsLive] = useState<boolean | null>(null);
  const [skyCenter, setSkyCenter] = useState<{ ra: number; dec: number } | null>(null);
  const [skyFov, setSkyFov] = useState<number | null>(null);
  const [skyCursor, setSkyCursor] = useState<{ ra: number; dec: number } | null>(null);
  const aladinInstanceRef = useRef<AladinInstance | null>(null);
  const [selMethod, setSelMethod] = useState<null | "map-click" | "map-rect" | "manual" | "camera">(null);
  const [clampOffer, setClampOffer] = useState<null | { ra: number; dec: number; asked: number }>(null);
  const [footprintsOn, setFootprintsOn] = useState(true);
  const [cooGridOn, setCooGridOn] = useState(true);
  const [reticleOn, setReticleOn] = useState(true);
  const [mapMode, setMapMode] = useState<"pan" | "select">("select");
  // Hand-tracking (MediaPipe) state; camera stream reuses camOn/camMsg below.
  const [handStatus, setHandStatus] = useState<"off" | "loading" | "tracking" | "no-hand" | "error">("off");
  const [handHint, setHandHint] = useState("");
  const [handCursor, setHandCursor] = useState<{ x: number; y: number } | null>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handRafRef = useRef(0);
  const handLastVideoTRef = useRef(-1);
  const handPinchRef = useRef<{
    start: number;
    active: boolean;
    confirmed: boolean;
    stableX: number;
    stableY: number;
  }>({ start: 0, active: false, confirmed: false, stableX: 0, stableY: 0 });
  const handSmoothedRef = useRef<{ x: number; y: number; pinch: number } | null>(null);
  const regionRadiusRef = useRef(regionRadius);
  regionRadiusRef.current = regionRadius;
  const regionSearchFlight = useRef<AbortController | null>(null);

  // M2B: Compare Observations page.
  const [cmpRa, setCmpRa] = useState("133.786245");
  const [cmpDec, setCmpDec] = useState("-7.244372");
  const [cmpRadius, setCmpRadius] = useState("0.05");
  const [cmpMsg, setCmpMsg] = useState("");
  const [cmpStatus, setCmpStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [cmpBands, setCmpBands] = useState<CmpBand[]>([]);
  const [cmpMinSep, setCmpMinSep] = useState<number>(0.5);
  const [cmpBand, setCmpBand] = useState<number | null>(null);
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");
  const [cmpRun, setCmpRun] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [cmpError, setCmpError] = useState("");
  const [cmpResult, setCmpResult] = useState<CmpResult | null>(null);
  const [cmpRegion, setCmpRegion] = useState<{ ra: number; dec: number; radius: number } | null>(null);
  const [cmpPairs, setCmpPairs] = useState<CmpPair[]>([]);

  // M2C: Candidate Objects page.
  const [candJobs, setCandJobs] = useState<CandJob[]>([]);
  const [candJobsStatus, setCandJobsStatus] = useState<"idle" | "loading" | "ready" | "empty" | "error">("idle");
  const [candJobsMsg, setCandJobsMsg] = useState("");
  const [candJobId, setCandJobId] = useState("");
  const [candThr, setCandThr] = useState("5.0");
  const [candMinArea, setCandMinArea] = useState("5");
  const [candDeblend, setCandDeblend] = useState(true);
  const [candRun, setCandRun] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [candError, setCandError] = useState("");
  const [candResult, setCandResult] = useState<CandResult | null>(null);
  const [candFilter, setCandFilter] = useState<"all" | "positive" | "negative">("all");
  const [candSel, setCandSel] = useState<string | null>(null);
  // M3D-B §2: session-level connection + search state. Backend status comes
  // only from /health; IRSA status only from real SIA-backed traffic.
  // Nothing is polled; checks run on demand or after genuine requests.
  type ConnState = "idle" | "checking" | "ok" | "error";
  const [backendStatus, setBackendStatus] = useState<ConnState>("idle");
  const [backendCheckedAt, setBackendCheckedAt] = useState<string | null>(null);
  const [backendError, setBackendError] = useState("");
  const backendFlight = useRef<AbortController | null>(null);
  const [irsaStatus, setIrsaStatus] = useState<ConnState>("idle");
  const [irsaCheckedAt, setIrsaCheckedAt] = useState<string | null>(null);
  const [irsaError, setIrsaError] = useState("");
  const irsaFlight = useRef<AbortController | null>(null);
  const [searchSummary, setSearchSummary] = useState<null | {
    n_obs: number; n_records: number; n_bands: number; at: string; source: string;
  }>(null);

  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const skyBoxRef = useRef<HTMLDivElement | null>(null);
  // M3C-C: abort handles for in-flight result fetches. A late response must
  // never repopulate results the user has already moved past (M3B H1 gap).
  const cmpFlight = useRef<AbortController | null>(null);
  const candFlight = useRef<AbortController | null>(null);
  const skySectionRef = useRef<HTMLElement | null>(null);

  const API_BASE =
    (import.meta.env as unknown as Record<string, string | undefined>).VITE_SPHEREX_API ??
    "http://localhost:8001";

  const stampNow = () => new Date().toLocaleString();

  // Real backend check: GET /health only. Never inferred from anything else.
  const checkBackend = () => {
    if (backendStatus === "checking") return;
    backendFlight.current?.abort();
    const ctrl = new AbortController();
    backendFlight.current = ctrl;
    setBackendStatus("checking");
    setBackendError("");
    const timer = window.setTimeout(() => ctrl.abort(), 70000);
    fetch(`${API_BASE}/health`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(() => {
        if (ctrl.signal.aborted) return;
        setBackendStatus("ok");
        setBackendCheckedAt(stampNow());
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setBackendStatus("error");
        setBackendError(
          (err as Error)?.name === "AbortError" ? "Check timed out." : String((err as Error)?.message ?? err),
        );
      })
      .finally(() => window.clearTimeout(timer));
  };

  // IRSA is marked available only after a genuine SIA-backed response.
  const noteIrsa = (ok: boolean, msg?: string) => {
    if (ok) {
      setIrsaStatus("ok");
      setIrsaCheckedAt(stampNow());
      setIrsaError("");
    } else {
      setIrsaStatus("error");
      setIrsaError(msg ?? "IRSA request failed.");
    }
  };

  const clearRegionResults = () => {
    regionSearchFlight.current?.abort();
    regionSearchFlight.current = null;
    setRegionMsg("");
    setRegionErrorKind(null);
    setObsList([]);
    setObsStatus("idle");
    setSelectedObs(null);
    setRegionSummary(null);
    setTile(null);
    setTileStatus("idle");
  };

  // Explicit minimal connection check: a tiny-radius real SIA query.
  // Cheap by design (0.01 deg cone); never a broad search.
  const checkIrsa = () => {
    if (irsaStatus === "checking") return;
    irsaFlight.current?.abort();
    const ctrl = new AbortController();
    irsaFlight.current = ctrl;
    setIrsaStatus("checking");
    setIrsaError("");
    const timer = window.setTimeout(() => ctrl.abort(), 70000);
    fetch(
      `${API_BASE}/api/observations?ra=133.786245&dec=-7.244372&radius_deg=0.01&collection=spherex_dr1`,
      { signal: ctrl.signal },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(() => {
        if (ctrl.signal.aborted) return;
        noteIrsa(true);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) {
          setIrsaStatus("error");
          setIrsaError("Check timed out or was superseded.");
          return;
        }
        noteIrsa(false, (err as Error)?.name === "AbortError" ? "Check timed out." : String((err as Error)?.message ?? err));
      })
      .finally(() => window.clearTimeout(timer));
  };

  // M2A: user-driven region + observation selection.
  // The fixed test coordinate now lives only as the initial field values,
  // clearly an example, never silently substituted.
  const runRegionSearch = (overrideRa?: string | React.MouseEvent, overrideDec?: string, overrideRadius?: string) => {
    if (obsStatus === "loading" || regionSearchFlight.current) return;
    if (overrideRa && typeof overrideRa !== "string") {
      // Called as onClick handler — ignore event, use state
      overrideRa = undefined;
      overrideDec = undefined;
      overrideRadius = undefined;
    }
    const raRaw = ((overrideRa as string | undefined) ?? regionRa).trim();
    const decRaw = (overrideDec ?? regionDec).trim();
    const radiusRaw = (overrideRadius ?? regionRadius).trim();
    if (!raRaw || !decRaw || !radiusRaw) {
      setRegionErrorKind("invalid");
      setRegionMsg("RA, Dec and radius are all required.");
      return;
    }
    const ra = Number(raRaw);
    const dec = Number(decRaw);
    const radius = Number(radiusRaw);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(radius)) {
      setRegionErrorKind("invalid");
      setRegionMsg("Enter valid numbers for RA, Dec and radius.");
      return;
    }
    if (ra < 0 || ra >= 360) {
      setRegionErrorKind("invalid");
      setRegionMsg("RA must be within [0, 360) degrees.");
      return;
    }
    if (dec < -90 || dec > 90) {
      setRegionErrorKind("invalid");
      setRegionMsg("Dec must be within [-90, 90] degrees.");
      return;
    }
    if (radius <= 0 || radius > 1) {
      setRegionErrorKind("invalid");
      setRegionMsg("Radius must be within (0, 1] degrees.");
      return;
    }
    setRegionMsg("");
    setRegionErrorKind(null);
    setObsStatus("loading");
    setSelectedObs(null);
    setObsList([]);
    setRegionSummary(null);
    setTile(null);
    setTileStatus("idle");
    const ctrl = new AbortController();
    regionSearchFlight.current = ctrl;
    fetch(
      `${API_BASE}/api/observations?ra=${ra}&dec=${dec}&radius_deg=${radius}&collection=spherex_dr1`,
      { signal: ctrl.signal },
    )
      .then(async (r) => {
        if (!r.ok) {
          const payload: unknown = await r.json().catch(() => null);
          throw new RegionSearchHttpError(r.status, getApiErrorDetail(payload));
        }
        return r.json();
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const recs = (d.records ?? []) as Array<Record<string, unknown>>;
        const obs = recs.map((r) => ({
          obs_id: typeof r.obs_id === "string" ? r.obs_id : "",
          detector: typeof r.detector === "number" ? r.detector : null,
          band: typeof r.band === "number" ? r.band : null,
          t_min_mjd: typeof r.t_min_mjd === "number" ? r.t_min_mjd : null,
          t_max_mjd: typeof r.t_max_mjd === "number" ? r.t_max_mjd : null,
          access_format: typeof r.access_format === "string" ? r.access_format : null,
          has_access: typeof r.access_url === "string" && r.access_url.length > 0,
          footprint: normalizeFootprint(r.footprint),
        }));
        // De-duplicate on obs_id for the selectable list; keep first row per obs.
        const seen = new Map<string, (typeof obs)[number]>();
        for (const o of obs) {
          if (o.obs_id && !seen.has(o.obs_id)) seen.set(o.obs_id, o);
        }
        const uniq = [...seen.values()];
        setObsList(uniq);
        setRegionSummary({ ra, dec, radius, n_obs: uniq.length });
        setObsStatus(uniq.length > 0 ? "ready" : "empty");
        // M3D-B §2: a genuine SIA-backed response marks IRSA available and
        // refreshes the session search summary (failures never clear it).
        noteIrsa(true);
        const bandSet = new Set(obs.map((o) => o.band));
        bandSet.delete(null);
        setSearchSummary({
          n_obs: uniq.length,
          n_records: recs.length,
          n_bands: bandSet.size,
          at: stampNow(),
          source: "Explore sky",
        });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setObsStatus("error");
        const failure = describeRegionSearchError(err);
        setRegionErrorKind(failure.kind);
        setRegionMsg(failure.message);
        noteIrsa(false, failure.message);
      })
      .finally(() => {
        if (regionSearchFlight.current === ctrl) regionSearchFlight.current = null;
      });
  };

  const loadObservation = (obs_id: string) => {
    if (!regionSummary) return;
    setSelectedObs(obs_id);
    setTileStatus("loading");
    const { ra, dec } = regionSummary;
    fetch(
      `${API_BASE}/api/tiles/preview?ra=${ra}&dec=${dec}&size_deg=0.2&collection=spherex_dr1&obs_id=${encodeURIComponent(obs_id)}`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const m = (d.metadata ?? {}) as Record<string, unknown>;
        const det = typeof m.detector === "number" ? m.detector : null;
        setTile({
          url: `${API_BASE}${d.image_url as string}`,
          obs_id: typeof m.obs_id === "string" ? m.obs_id : null,
          detector: det,
          band: det,
          shape: Array.isArray(m.shape) ? (m.shape as number[]) : [],
          unit: typeof m.unit === "string" ? m.unit : "",
          center: Array.isArray(m.center_ra_dec) ? (m.center_ra_dec as number[]) : null,
        });
        setTileStatus("ready");
      })
      .catch((err) => {
        setTileStatus("unavailable");
        setRegionMsg(`Preview failed: ${String((err as Error).message ?? err)}`);
      });
  };

  // ---- Interactive All-Sky helpers (Aladin Lite v3 + HiPS) ----
  const normRa = (ra: number) => ((ra % 360) + 360) % 360;

  // Selection circle and footprint MOCs now live in <AladinSky>; these
  // helpers were moved there. Kept stub for backward-compat if referenced.

  /** Apply a sky selection to the ONE shared state. False if rejected.
   *  The sky marker is rendered by <AladinSky> from regionRa/Dec/Radius. */
  const applySkySelection = (
    ra: number,
    dec: number,
    radiusDeg: number,
    method: "map-click" | "map-rect" | "manual" | "camera",
  ): boolean => {
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(radiusDeg)) return false;
    if (dec < -90 || dec > 90 || radiusDeg <= 0) return false;
    clearRegionResults();
    const r = normRa(ra);
    setRegionRa(String(+r.toFixed(5)));
    setRegionDec(String(+dec.toFixed(5)));
    setRegionRadius(String(+Math.min(radiusDeg, 1).toFixed(4)));
    setSelMethod(method);
    setClampOffer(null);
    return true;
  };

  /** Ray-cast point-in-polygon on lon/lat with RA wraparound handling. */
  const pointInLonLatPolygon = (lon: number, lat: number, verts: Array<[number, number]>): boolean => {
    if (verts.length < 3) return false;
    const shifted = verts.map(([x, y]) => {
      const dx = ((x - lon + 540) % 360) - 180;
      return [lon + dx, y] as [number, number];
    });
    let inside = false;
    for (let i = 0, j = shifted.length - 1; i < shifted.length; j = i++) {
      const [xi, yi] = shifted[i];
      const [xj, yj] = shifted[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  // Live follow mirrors the cursor in validated map views, not the 3D globe.
  // Throttled to ~60ms so the cyan selection circle follows the mouse smoothly
  // without overwriting mid-typing. Radius is preserved; footer CURSOR stays independent.
  const liveFollowRef = useRef<number>(0);
  useEffect(() => {
    if (skyViewMode === "globe") return;
    if (!skyCursor) return;
    if (mapMode !== "select") return;
    if (camOn) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae && ae.tagName === "INPUT" && ae.closest(".region-inputs")) return;
    const now = Date.now();
    if (now - liveFollowRef.current < 60) return;
    liveFollowRef.current = now;
    const r = normRa(skyCursor.ra);
    // Avoid churn when already close (<0.0005°)
    const curRa = Number(regionRa);
    const curDec = Number(regionDec);
    if (Number.isFinite(curRa) && Number.isFinite(curDec)) {
      if (Math.abs(curRa - r) < 0.0005 && Math.abs(curDec - skyCursor.dec) < 0.0005) return;
    }
    clearRegionResults();
    setRegionRa(String(+r.toFixed(5)));
    setRegionDec(String(+skyCursor.dec.toFixed(5)));
  }, [skyCursor, mapMode, camOn, regionRa, regionDec, skyViewMode]);

  /** Spherical centroid of lon/lat vertices (robust to RA wraparound). */
  const sphericalCentroid = (verts: Array<[number, number]>): { ra: number; dec: number } => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const [lon, lat] of verts) {
      const la = (lat * Math.PI) / 180;
      const lo = (lon * Math.PI) / 180;
      x += Math.cos(la) * Math.cos(lo);
      y += Math.cos(la) * Math.sin(lo);
      z += Math.sin(la);
    }
    const n = Math.max(verts.length, 1);
    x /= n;
    y /= n;
    z /= n;
    const hyp = Math.hypot(x, y);
    return { ra: normRa((Math.atan2(y, x) * 180) / Math.PI), dec: (Math.atan2(z, hyp) * 180) / Math.PI };
  };

  // Footprint rendering now lives in <AladinSky> (passed obsList/selectedObs).

  // M2B: choose a defensible default pair from real metadata only.
  const cmpPairFor = (observations: CmpObs[], minSep: number): { a: CmpObs; b: CmpObs } | null => {
    const usable = observations
      .filter((o) => o.has_access && typeof o.t_min_mjd === "number")
      .sort((x, y) => (x.t_min_mjd as number) - (y.t_min_mjd as number));
    if (usable.length < 2) return null;
    let best: { a: CmpObs; b: CmpObs } | null = null;
    for (let i = 0; i < usable.length; i += 1) {
      for (let j = i + 1; j < usable.length; j += 1) {
        const dt = Math.abs((usable[j].t_min_mjd as number) - (usable[i].t_min_mjd as number));
        if (dt < minSep) continue;
        if (!best || dt > Math.abs((best.b.t_min_mjd as number) - (best.a.t_min_mjd as number))) {
          best = { a: usable[i], b: usable[j] };
        }
      }
    }
    // Fall back to the widest real pair even if it fails the separation rule;
    // the backend will then reject it with an explicit message.
    return best ?? { a: usable[0], b: usable[usable.length - 1] };
  };

  const applyBand = (band: number | null, bands: CmpBand[], minSep: number) => {
    setCmpBand(band);
    const group = bands.find((b) => b.band === band);
    const pair = group ? cmpPairFor(group.observations, minSep) : null;
    setCmpA(pair ? pair.a.obs_id : "");
    setCmpB(pair ? pair.b.obs_id : "");
    // M3B H1: a new band means a new pair — drop results from the old one.
    cmpFlight.current?.abort();
    setCmpResult(null);
    setCmpRun("idle");
    setCmpError("");
  };

  // M3B H1: changing either epoch invalidates the displayed comparison.
  // Aborting first guarantees a late response cannot restore it (M3C-C).
  const pickCmpA = (v: string) => {
    cmpFlight.current?.abort();
    setCmpA(v);
    setCmpResult(null);
    setCmpRun("idle");
    setCmpError("");
  };
  const pickCmpB = (v: string) => {
    cmpFlight.current?.abort();
    setCmpB(v);
    setCmpResult(null);
    setCmpRun("idle");
    setCmpError("");
  };

  const runCompareSearch = () => {
    const raRaw = cmpRa.trim();
    const decRaw = cmpDec.trim();
    const radiusRaw = cmpRadius.trim();
    if (!raRaw || !decRaw || !radiusRaw) {
      setCmpMsg("RA, Dec and radius are all required.");
      return;
    }
    const ra = Number(raRaw);
    const dec = Number(decRaw);
    const radius = Number(radiusRaw);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(radius)) {
      setCmpMsg("Enter valid numbers for RA, Dec and radius.");
      return;
    }
    if (ra < 0 || ra >= 360) {
      setCmpMsg("RA must be within [0, 360) degrees.");
      return;
    }
    if (dec < -90 || dec > 90) {
      setCmpMsg("Dec must be within [-90, 90] degrees.");
      return;
    }
    if (radius <= 0 || radius > 1) {
      setCmpMsg("Radius must be within (0, 1] degrees.");
      return;
    }
    setCmpMsg("");
    setCmpStatus("loading");
    setCmpBands([]);
    setCmpBand(null);
    setCmpA("");
    setCmpB("");
    setCmpPairs([]);
    setCmpResult(null);
    setCmpRun("idle");
    setCmpError("");
    cmpFlight.current?.abort();
    fetch(
      `${API_BASE}/api/compare/available?ra=${ra}&dec=${dec}&radius_deg=${radius}&collection=spherex_dr1`,
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const bands = (Array.isArray(d.bands) ? d.bands : []) as CmpBand[];
        const pairs = (Array.isArray(d.pairs) ? d.pairs : []) as CmpPair[];
        const sep = typeof d.min_epoch_separation_days === "number" ? d.min_epoch_separation_days : 0.5;
        setCmpBands(bands);
        setCmpPairs(pairs);
        setCmpMinSep(sep);
        setCmpRegion({ ra, dec, radius });
        // M3D-B §2: genuine SIA-backed response — mark IRSA available and
        // refresh the session search summary (failures never clear it).
        noteIrsa(true);
        const nObs = bands.reduce((n, b) => n + (typeof b.n_observations === "number" ? b.n_observations : 0), 0);
        setSearchSummary({
          n_obs: nObs,
          n_records: typeof d.n_rows === "number" ? d.n_rows : nObs,
          n_bands: bands.length,
          at: stampNow(),
          source: "Compare observations",
        });
        if (!bands.length) {
          setCmpStatus("empty");
          setCmpMsg("SIA2 returned no observations covering this region in this collection.");
          return;
        }
        const suggested = pairs.find((p) => p.band !== null);
        const withTwo = bands.filter(
          (b) => b.observations.filter((o) => o.has_access && o.t_min_mjd !== null).length >= 2,
        );
        const initialBand = suggested?.band ?? withTwo[0]?.band ?? bands[0].band;
        applyBand(initialBand, bands, sep);
        setCmpStatus("ready");
      })
      .catch((err) => {
        setCmpStatus("error");
        const msg = `Search failed: ${String((err as Error).message ?? err)}`;
        setCmpMsg(msg);
        noteIrsa(false, String((err as Error).message ?? err));
      });
  };

  const runCompare = () => {
    if (!cmpRegion) {
      setCmpRun("error");
      setCmpError("Search for a region first so the server can resolve both observations.");
      return;
    }
    if (!cmpA || !cmpB) {
      setCmpRun("error");
      setCmpError("Select two observations in the same band.");
      return;
    }
    if (cmpA === cmpB) {
      setCmpRun("error");
      setCmpError("Select two different observations; comparing an observation with itself proves nothing.");
      return;
    }
    if (cmpBand === null) {
      setCmpRun("error");
      setCmpError("Select a band first; temporal comparison requires one shared band.");
      return;
    }
    setCmpRun("loading");
    setCmpError("");
    setCmpResult(null);
    cmpFlight.current?.abort();
    const ctrl = new AbortController();
    cmpFlight.current = ctrl;
    const q = new URLSearchParams({
      ra: String(cmpRegion.ra),
      dec: String(cmpRegion.dec),
      size_deg: "0.2",
      collection: "spherex_dr1",
      obs_id_a: cmpA,
      obs_id_b: cmpB,
      band_a: String(cmpBand),
      band_b: String(cmpBand),
    });
    fetch(`${API_BASE}/api/compare/result?${q.toString()}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          const detail = body?.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : detail?.message
                ? `${detail.code}: ${detail.message}`
                : `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return body;
      })
      .then((d) => {
        if (ctrl.signal.aborted) return; // superseded by a newer run/selection
        const res = d as CmpResult;
        setCmpResult(res);
        setCmpRun("ready");
        // M3B H1: a new comparison job supersedes previous candidate results.
        if (candResult && candResult.compare_job_id !== res.job_id) {
          setCandResult(null);
          setCandSel(null);
          setCandRun("idle");
          setCandError("");
        }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return; // owner of the new state already set it
        setCmpRun("error");
        setCmpError(String((err as Error).message ?? err));
      });
  };

  const cmpSelectedBand = cmpBands.find((b) => b.band === cmpBand) ?? null;
  const cmpObsA = cmpSelectedBand?.observations.find((o) => o.obs_id === cmpA) ?? null;
  const cmpObsB = cmpSelectedBand?.observations.find((o) => o.obs_id === cmpB) ?? null;
  const cmpSepDays =
    cmpObsA && cmpObsB && cmpObsA.t_min_mjd !== null && cmpObsB.t_min_mjd !== null
      ? Math.abs(cmpObsB.t_min_mjd - cmpObsA.t_min_mjd)
      : null;

  const navGroups: { label: string; items: { icon: IconName; label: string }[] }[] = [
    { label: "Overview", items: [{ icon: "home", label: "Home" }] },
    { label: "Explore", items: [{ icon: "sky", label: "Explore sky" }] },
    {
      label: "Analyze",
      items: [
        { icon: "compare", label: "Compare observations" },
        { icon: "activity", label: "Change Detection" },
        { icon: "objects", label: "Candidate objects" },
      ],
    },
    { label: "Learn", items: [{ icon: "learn", label: "Learn" }] },
  ];

  const meta = pageMeta[activeNav] ?? pageMeta["Explore sky"];

  useEffect(() => {
    document.body.classList.toggle("nav-open", navOpen);
    return () => document.body.classList.remove("nav-open");
  }, [navOpen]);

  const go = (label: string) => {
    setActiveNav(label);
    setNavOpen(false);
  };

  const enableCameraMode = () => {
    setCamMsg("");
    setHandHint("");
    setSkyViewMode("coverage");
    setCamOn(true);
  };

  // Hand-skeleton tracking (MediaPipe) + local preview. All frames stay on
  // device — never uploaded. Falls back to no-op if the model cannot load;
  // mouse/touch remain fully functional.
  useEffect(() => {
    if (!camOn) {
      setHandStatus("off");
      setHandHint("");
      setHandCursor(null);
      setCamGesture("");
      handSmoothedRef.current = null;
      handPinchRef.current = { start: 0, active: false, confirmed: false, stableX: 0, stableY: 0 };
      if (handLandmarkerRef.current) {
        try {
          handLandmarkerRef.current.close();
        } catch {
          setCamMsg("Hand-tracking resources could not be released cleanly.");
        }
        handLandmarkerRef.current = null;
      }
      if (handRafRef.current) {
        cancelAnimationFrame(handRafRef.current);
        handRafRef.current = 0;
      }
      return;
    }
    if (activeNav !== "Explore sky") {
      setCamOn(false);
      return;
    }

    let stopped = false;
    let stream: MediaStream | null = null;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCamMsg("Camera API unavailable in this browser — mouse and touch still work.");
          setHandStatus("error");
          setHandHint("getUserMedia unavailable");
          setCamOn(false);
          return;
        }
        setHandStatus("loading");
        setHandHint("Requesting camera…");
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        streamRef.current = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          try {
            await video.play();
          } catch (error) {
            throw new Error(`Camera preview could not start: ${String((error as Error)?.message ?? error)}`);
          }
        }
        setCamMsg("");
        // Load MediaPipe HandLandmarker (local model, no CDN at runtime).
        setHandHint("Loading hand model…");
        let landmarker: any = null;
        try {
          const visionMod: any = await import("@mediapipe/tasks-vision");
          const wasmBase = "/models/wasm";
          // FilesetResolver needs the wasm base; model is served locally.
          const fileset = await visionMod.FilesetResolver.forVisionTasks(wasmBase);
          landmarker = await visionMod.HandLandmarker.createFromOptions(fileset, {
            baseOptions: {
              modelAssetPath: "/models/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        } catch (e) {
          setHandStatus("error");
          setHandHint(`Hand model failed: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
          setCamGesture("");
          // Keep camera preview alive even if tracking fails.
          return;
        }
        if (stopped) {
          try {
            landmarker?.close();
          } catch {
            /* ignore */
          }
          return;
        }
        handLandmarkerRef.current = landmarker;
        setHandStatus("tracking");
        setHandHint("Show your hand to the camera");

        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
          Math.hypot(a.x - b.x, a.y - b.y);

        const loop = () => {
          if (stopped) return;
          handRafRef.current = requestAnimationFrame(loop);
          const v = videoRef.current;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || !landmarker) return;
          if (v.currentTime === handLastVideoTRef.current) return;
          handLastVideoTRef.current = v.currentTime;
          let result: { landmarks?: Array<Array<{ x: number; y: number }>> } | null = null;
          try {
            result = landmarker.detectForVideo(v, performance.now());
          } catch {
            return;
          }
          const hands = result?.landmarks;
          if (!hands || hands.length === 0) {
            setHandStatus("no-hand");
            setHandCursor(null);
            setCamGesture("");
            handSmoothedRef.current = null;
            handPinchRef.current = { start: 0, active: false, confirmed: false, stableX: 0, stableY: 0 };
            return;
          }
          setHandStatus("tracking");
          const lm = hands[0];
          const thumbTip = lm[4];
          const indexTip = lm[8];
          const middleTip = lm[12];
          const ringTip = lm[16];
          const pinkyTip = lm[20];
          const indexPip = lm[6];
          const middlePip = lm[10];
          const ringPip = lm[14];
          const pinkyPip = lm[18];
          const palmWidth = dist(lm[5], lm[17]);
          const pinch = palmWidth > 0 ? dist(thumbTip, indexTip) / palmWidth : 1;
          // Pointing: only index extended (tip y above pip), others folded.
          const isIndexExtended = indexTip.y < indexPip.y - 0.02;
          const isMiddleFolded = middleTip.y > middlePip.y - 0.01;
          const isRingFolded = ringTip.y > ringPip.y - 0.01;
          const isPinkyFolded = pinkyTip.y > pinkyPip.y - 0.01;
          const isPointing = isIndexExtended && isMiddleFolded && isRingFolded && isPinkyFolded;
          // Open palm: at least 3 fingers extended beyond wrist spread.
          const palmOpen =
            [indexTip, middleTip, ringTip, pinkyTip].filter((t, i) => {
              const pips = [indexPip, middlePip, ringPip, pinkyPip];
              return t.y < pips[i].y - 0.02;
            }).length >= 3;

          // Smooth cursor.
          const rawX = 1 - indexTip.x; // mirror
          const rawY = indexTip.y;
          const sm = handSmoothedRef.current;
          const alpha = 0.25;
          const cur = sm
            ? { x: sm.x * (1 - alpha) + rawX * alpha, y: sm.y * (1 - alpha) + rawY * alpha, pinch: sm.pinch * (1 - alpha) + pinch * alpha }
            : { x: rawX, y: rawY, pinch };
          const dx = sm ? cur.x - sm.x : 0;
          const dy = sm ? cur.y - sm.y : 0;
          const dPinch = sm ? cur.pinch - sm.pinch : 0;
          handSmoothedRef.current = cur;
          setHandCursor({ x: cur.x, y: cur.y });

          const al = aladinInstanceRef.current;
          const now = Date.now();
          const skyPositionAt = () => {
            const host = skyBoxRef.current?.querySelector(".aladin-host");
            if (!al || !(host instanceof HTMLElement)) return null;
            const bounds = host.getBoundingClientRect();
            if (bounds.width <= 0 || bounds.height <= 0) return null;
            try {
              const world = al.pix2world(cur.x * bounds.width, cur.y * bounds.height);
              return Array.isArray(world) && Number.isFinite(world[0]) && Number.isFinite(world[1])
                ? { ra: world[0], dec: world[1] }
                : null;
            } catch {
              return null;
            }
          };

          // Hysteresis keeps a held pinch active despite small landmark jitter.
          const pinchState = handPinchRef.current;
          const isPinching = pinchState.active ? cur.pinch < 0.48 : cur.pinch < 0.38;
          if (isPinching) {
            if (!pinchState.active) {
              handPinchRef.current = { start: now, active: true, confirmed: false, stableX: cur.x, stableY: cur.y };
              setHandHint("Pinch and hold still to confirm the selected position.");
              setCamGesture("PINCH → hold to confirm");
            } else if (Math.hypot(cur.x - pinchState.stableX, cur.y - pinchState.stableY) > 0.02) {
              handPinchRef.current = { ...pinchState, start: now, stableX: cur.x, stableY: cur.y };
              if (!pinchState.confirmed) setHandHint("Keep the pinch steady to confirm.");
            } else if (!pinchState.confirmed && now - pinchState.start >= 700) {
              handPinchRef.current = { ...pinchState, confirmed: true };
              const world = skyPositionAt();
              if (world) {
                applySkySelection(world.ra, world.dec, Number(regionRadiusRef.current) || 0.05, "camera");
                setCamGesture("SELECTION CONFIRMED");
                setHandHint("Selection confirmed. Press Search selected region to run the query.");
              } else {
                setCamGesture("VIEWER NOT READY");
                setHandHint("Sky viewer is initializing; try the pinch again when it is ready.");
              }
            }
          } else {
            handPinchRef.current = { start: 0, active: false, confirmed: false, stableX: 0, stableY: 0 };
          }

          // Open palm → pan.
          if (palmOpen && !isPinching) {
            if (sm && al && Math.abs(dx) + Math.abs(dy) > 0.001) {
              const [fovX, fovY] = al.getFoV();
              const [ra, dec] = al.getRaDec();
              const raScale = Math.max(0.1, Math.cos((dec * Math.PI) / 180));
              const nextRa = ((ra - (dx * fovX) / raScale) % 360 + 360) % 360;
              const nextDec = Math.max(-89, Math.min(89, dec + dy * fovY));
              al.gotoRaDec(nextRa, nextDec);
              setCamGesture("OPEN PALM → pan");
            } else if (!al) {
              setHandHint("Sky viewer is initializing.");
            }
            if (al) setHandHint("Open palm → pan the sky.");
            return;
          }

          // Pinch → zoom.
          if (isPinching && !palmOpen) {
            if (Math.abs(dPinch) > 0.003 && al) {
              const [fovX] = al.getFoV();
              al.setFoV(Math.max(0.5, Math.min(180, fovX * Math.exp(dPinch * 3))));
              setCamGesture(dPinch < 0 ? "PINCH → zoom in" : "PINCH → zoom out");
            } else if (!al) {
              setHandHint("Sky viewer is initializing.");
              return;
            }
            if (!handPinchRef.current.confirmed) setHandHint("Pinch distance controls zoom; hold still to confirm.");
            return;
          }

          // Pointing → map the cursor to celestial coordinates using Aladin's public API.
          if (isPointing) {
            const world = skyPositionAt();
            if (world) {
              setSkyCursor(world);
              setHandHint("Point to move the sky cursor; pinch and hold to confirm.");
              setCamGesture("POINT → sky cursor");
            } else {
              setHandHint("Sky viewer is initializing.");
              setCamGesture("");
            }
            return;
          }

          setHandHint("Point to position · open palm to pan · pinch to zoom or hold to confirm.");
          setCamGesture("");
        };
        loop();
      } catch (error) {
        if (!stopped) {
          const name = error instanceof DOMException ? error.name : "";
          setCamMsg(
            name === "NotAllowedError" || name === "SecurityError"
              ? "Camera permission was denied. Allow camera access in the browser, or use Mouse Mode."
              : `Camera could not start: ${String((error as Error)?.message ?? error)}`,
          );
          setHandStatus("error");
          setHandHint("Camera unavailable");
          setCamOn(false);
        }
      }
    };
    start();
    return () => {
      stopped = true;
      if (handRafRef.current) cancelAnimationFrame(handRafRef.current);
      handRafRef.current = 0;
      if (handLandmarkerRef.current) {
        try {
          handLandmarkerRef.current.close();
        } catch {
          /* ignore */
        }
        handLandmarkerRef.current = null;
      }
      stream?.getTracks().forEach((t) => t.stop());
      if (streamRef.current === stream) streamRef.current = null;
      else streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      handSmoothedRef.current = null;
      handPinchRef.current = { start: 0, active: false, confirmed: false, stableX: 0, stableY: 0 };
      setHandStatus("off");
      setHandHint("");
      setHandCursor(null);
      setCamGesture("");
    };
  }, [camOn, activeNav]);

  const resetView = () => {
    setZoom(32);
    setPan({ x: 0, y: 0 });
    const al = aladinInstanceRef.current;
    if (al) {
      try {
        al.gotoRaDec(0, 0);
        al.setFoV(180);
      } catch {
        /* best-effort */
      }
    }
  };

  const toggleFullscreen = () => {
    const el = skySectionRef.current as unknown as { requestFullscreen?: () => Promise<void> } | null;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (el?.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    }
  };

  const onSkyDown = (e: React.PointerEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y, moved: false };
    setDragging(true);
  };

  const onSkyMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) {
      setPan({
        x: Math.max(-700, Math.min(700, d.ox + dx)),
        y: Math.max(-450, Math.min(450, d.oy + dy)),
      });
    }
  };

  const onSkyUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (d && !d.moved) {
      // Tap: centre the tapped point. Purely relative — no coordinates claimed.
      const box = skyBoxRef.current?.getBoundingClientRect();
      if (box) {
        const tx = e.clientX - (box.left + box.width / 2);
        const ty = e.clientY - (box.top + box.height / 2);
        setPan((q) => ({
          x: Math.max(-700, Math.min(700, q.x - tx)),
          y: Math.max(-450, Math.min(450, q.y - ty)),
        }));
      }
    }
  };

  // M2C: evidence-based candidate detection on a stored M2B comparison job.
  const loadCandJobs = () => {
    setCandJobsStatus("loading");
    setCandJobsMsg("");
    fetch(`${API_BASE}/api/compare/jobs`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const jobs = (Array.isArray(d.jobs) ? d.jobs : []) as CandJob[];
        setCandJobs(jobs);
        if (!jobs.length) {
          setCandJobsStatus("empty");
          setCandJobsMsg("No comparison jobs are stored yet. Run a comparison first.");
          return;
        }
        setCandJobsStatus("ready");
        const usable = jobs.filter((j) => j.has_products);
        if (!candJobId || !jobs.some((j) => j.job_id === candJobId)) {
          setCandJobId(usable.length > 0 ? usable[0].job_id : jobs[0].job_id);
        }
      })
      .catch((err) => {
        setCandJobsStatus("error");
        setCandJobsMsg(`Could not list comparison jobs: ${String((err as Error).message ?? err)}`);
      });
  };

  // M3D-B §5: lightweight detection summary for the Change Detection
  // dashboard. Reads only the cached result; never runs detection.
  const [chgDet, setChgDet] = useState<null | { ok: true; positive: number; negative: number; total: number } | { ok: false }>(null);
  const chgFlight = useRef<AbortController | null>(null);
  const loadChangeSummary = (jobId: string) => {
    chgFlight.current?.abort();
    if (!jobId) {
      setChgDet(null);
      return;
    }
    const ctrl = new AbortController();
    chgFlight.current = ctrl;
    setChgDet(null);
    fetch(`${API_BASE}/api/candidates/${jobId}`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        const c = (d as { counts?: { positive?: number; negative?: number; total?: number } }).counts ?? {};
        setChgDet({
          ok: true,
          positive: typeof c.positive === "number" ? c.positive : 0,
          negative: typeof c.negative === "number" ? c.negative : 0,
          total: typeof c.total === "number" ? c.total : 0,
        });
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setChgDet({ ok: false });
      });
  };

  useEffect(() => {
    if (activeNav === "Candidate objects" && candJobsStatus === "idle") {
      loadCandJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav]);

  // M3D-B §5: keep the dashboard summary in step with the selected job.
  useEffect(() => {
    if (activeNav === "Change Detection") {
      if (candJobsStatus === "idle") loadCandJobs();
      if (candJobId) loadChangeSummary(candJobId);
      else setChgDet(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav, candJobId]);

  // M3D-B §2: one automatic backend check on first Home visit; IRSA is
  // never probed automatically (only real searches and the manual check).
  useEffect(() => {
    if (activeNav === "Home" && backendStatus === "idle") {
      checkBackend();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNav]);

  // M3B H1: a newly selected job must never show the previous job's
  // candidates. Detection results are cleared; the job list is kept.
  // Aborting first guarantees a late response cannot restore them (M3C-C).
  useEffect(() => {
    candFlight.current?.abort();
    setCandResult(null);
    setCandSel(null);
    setCandRun("idle");
    setCandError("");
  }, [candJobId]);

  const runCandDetect = () => {
    if (!candJobId) {
      setCandRun("error");
      setCandError("Select a comparison job first.");
      return;
    }
    const thr = Number(candThr);
    const area = Number(candMinArea);
    if (!Number.isFinite(thr) || thr < 3.0 || thr > 10.0) {
      setCandRun("error");
      setCandError("Threshold must be a number within [3.0, 10.0] sigma.");
      return;
    }
    if (!Number.isInteger(area) || area < 3 || area > 100) {
      setCandRun("error");
      setCandError("Minimum area must be an integer within [3, 100] pixels.");
      return;
    }
    setCandRun("loading");
    setCandError("");
    setCandResult(null);
    setCandSel(null);
    candFlight.current?.abort();
    const candCtrl = new AbortController();
    candFlight.current = candCtrl;
    fetch(`${API_BASE}/api/candidates/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: candJobId, threshold_sigma: thr, min_area: area, deblend: candDeblend }),
      signal: candCtrl.signal,
    })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) {
          const detail = (body as { detail?: { code?: string; message?: string } | string } | null)?.detail;
          const msg =
            typeof detail === "string"
              ? detail
              : detail?.message
                ? `${detail.code ? `${detail.code}: ` : ""}${detail.message}`
                : `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return body;
      })
      .then((d) => {
        if (candCtrl.signal.aborted) return; // superseded by a newer run/job
        setCandResult(d as CandResult);
        setCandRun("ready");
        setCandJobs((jobs) => jobs.map((j) => (j.job_id === candJobId ? { ...j, has_detection: true } : j)));
      })
      .catch((err) => {
        if (candCtrl.signal.aborted) return; // owner of the new state already set it
        setCandRun("error");
        setCandError(String((err as Error).message ?? err));
      });
  };

  const candVisible = (candResult?.candidates ?? []).filter(
    (c) => candFilter === "all" || c.sign === candFilter,
  );
  const candSelected = (candResult?.candidates ?? []).find((c) => c.id === candSel) ?? null;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Icon name="aperture" size={26} /></div>
          <div>
            <div className="brand-name">SPHER<span>Ex</span></div>
            <div className="brand-subtitle">Vision</div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <NavItem
                  key={item.label}
                  {...item}
                  active={activeNav === item.label}
                  onClick={() => go(item.label)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="mission-card">
            <div className="mission-icon"><Icon name="sparkle" size={18} /></div>
            <div className="eyebrow">Mission status</div>
            <div className="mission-title">IRSA archive link</div>
            <p>Live SIA2 metadata and FITS cutouts on demand. Availability varies; failures are reported, never hidden.</p>
            <button className="text-button" onClick={() => go("Learn")}>About the challenge <Icon name="arrow" size={14} /></button>
          </div>
          <div className="build-label">SPHEREx Vision</div>
        </div>
      </aside>
      <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button menu-btn" aria-label="Open navigation" onClick={() => setNavOpen((v) => !v)}>☰</button>
          <div>
            <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={13} /> {meta.crumb}</div>
            <h1>{meta.title}</h1>
          </div>
          <div className="topbar-actions">
            <span title="Guided tutorial is not available in this release">
              <button className="help-button" disabled aria-disabled="true"><Icon name="info" size={16} /> How to explore</button>
            </span>
          </div>
        </header>

        {activeNav === "Home" && (
          <div className="page-wrap">
            <div className="info-card">
              <span className="pill info">SPHEREx DR1 · Interactive Explorer</span>
              <h2 className="hero-title">Explore the Sky.<br /><span>Discover What Changes.</span></h2>
              <p className="page-lede">SPHEREx maps the entire sky every six months in 102 near-infrared bands. This tool lets anyone navigate the sky, select a region, compare two epochs, and inspect pipeline-flagged candidates — with honest empty states wherever the archive returns nothing.</p>
              <div className="layout-row">
                <button className="tool-button" onClick={() => setActiveNav("Explore sky")}><Icon name="arrow" size={14} /> Explore the Sky</button>
                <button className="text-button" onClick={() => setActiveNav("Learn")}>About SPHEREx</button>
              </div>
              <div className="learn-grid" style={{ marginTop: "16px" }}>
                <div className="info-card">
                  <div className="stat-num">102</div>
                  <div className="stat-cap">near-infrared bands (mission design)</div>
                </div>
                <div className="info-card">
                  <div className="stat-num">~6 mo</div>
                  <div className="stat-cap">full-sky revisit cadence</div>
                </div>
                <div className="info-card">
                  {searchSummary ? (
                    <>
                      <div className="stat-num">{searchSummary.n_obs}</div>
                      <div className="stat-cap">distinct observations · last {searchSummary.source} search</div>
                      <p className="hint-line">{searchSummary.n_records} records · {searchSummary.n_bands} bands · {searchSummary.at}</p>
                    </>
                  ) : (
                    <>
                      <div className="stat-num">—</div>
                      <div className="stat-cap">No successful search yet — run one in Explore sky or Compare observations</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="learn-grid">
              <div className="info-card">
                <div className="card-head"><h3>Sky Explorer</h3></div>
                <p className="body">Interactive sky navigation: pan, zoom, and outline a region.</p>
                <button className="text-button" onClick={() => setActiveNav("Explore sky")}>Open explorer <Icon name="arrow" size={14} /></button>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Time Comparison</h3></div>
                <p className="body">Side-by-side and slider layouts, ready for two epochs.</p>
                <button className="text-button" onClick={() => setActiveNav("Compare observations")}>Open compare <Icon name="arrow" size={14} /></button>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Change Detection</h3></div>
                <p className="body">A guided workflow across Compare Observations and Candidate Objects — pair epochs, inspect differences, review residuals.</p>
                <button className="text-button" onClick={() => setActiveNav("Change Detection")}>Open workflow <Icon name="arrow" size={14} /></button>
              </div>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>How it works</h3><span className="sub">4 steps</span></div>
              <dl className="kv-rows">
                <div className="kv-row"><dt>1 · Select region</dt><dd>Sky Explorer</dd></div>
                <div className="kv-row"><dt>2 · Retrieve observations</dt><dd>Explore sky (live archive search)</dd></div>
                <div className="kv-row"><dt>3 · Compare epochs</dt><dd>Time Comparison</dd></div>
                <div className="kv-row"><dt>4 · Review evidence</dt><dd>Candidate objects</dd></div>
              </dl>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Ready to explore</h3></div>
              <p className="body">All observation searches and image previews use live SPHEREx DR1 data from the IRSA archive. If a search is slow or fails, the app will show a clear message — no data is ever invented. Start in Sky Explorer by picking a sky region.</p>
              <button className="text-button" onClick={() => setActiveNav("Explore sky")}>Go to Sky Explorer <Icon name="arrow" size={14} /></button>
            </div>
          </div>
        )}

        {activeNav === "Explore sky" && (
          <div className="toolbar">
            <div className="mode-toggle" style={{ display: "flex", gap: 6 }}>
              <button className={`tool-button${skyViewMode === "globe" ? " active" : ""}`} onClick={() => setSkyViewMode("globe")} disabled={camOn}><Icon name="sky" size={16} /> 3D Globe</button>
              <button className={`tool-button${skyViewMode === "spherex" ? " active" : ""}`} onClick={() => setSkyViewMode("spherex")} disabled={camOn}>2D All-Sky</button>
              <button className={`tool-button${skyViewMode === "coverage" ? " active" : ""}`} onClick={() => setSkyViewMode("coverage")}>Coverage Map</button>
            </div>
            <div className="toolbar-divider" />
            <div className="region-inputs">
              <label className="rg-field"><span>RA (deg)</span><input value={regionRa} onChange={(e) => { clearRegionResults(); setRegionRa(e.target.value); setSelMethod("manual"); }} inputMode="decimal" aria-label="Right ascension in degrees" /></label>
              <label className="rg-field"><span>Dec (deg)</span><input value={regionDec} onChange={(e) => { clearRegionResults(); setRegionDec(e.target.value); setSelMethod("manual"); }} inputMode="decimal" aria-label="Declination in degrees" /></label>
              <label className="rg-field"><span>Radius (deg)</span><input value={regionRadius} onChange={(e) => { clearRegionResults(); setRegionRadius(e.target.value); setSelMethod("manual"); }} inputMode="decimal" aria-label="Search radius in degrees" /></label>
              <button className="tool-button" onClick={runRegionSearch} disabled={obsStatus === "loading"}>
                <Icon name="search" size={16} /> {obsStatus === "loading" ? "Searching…" : "Search selected region"}
              </button>
              <label className="rg-field" style={{ minWidth: "140px" }}>
                <span>Background survey</span>
                <select
                  value={skySurvey}
                  onChange={(e) => {
                    const v = e.target.value as typeof skySurvey;
                    setSkySurveyBusy(true);
                    setSkySurvey(v);
                    // AladinSky will clear busy on next frame; fallback timeout:
                    window.setTimeout(() => setSkySurveyBusy(false), 4000);
                  }}
                  disabled={skySurveyBusy}
                  aria-label="Background survey"
                  style={{ height: "34px", fontSize: "11px" }}
                >
                  <option value="CDS/P/2MASS/color">2MASS Color (default)</option>
                  <option value="CDS/P/DSS2/color">DSS2 Color</option>
                </select>
              </label>
            </div>
            <div className="toolbar-divider" />
            <div className="mode-toggle" style={{ display: "flex", gap: 6 }}>
              <button className={`tool-button${!camOn ? " active" : ""}`} onClick={() => setCamOn(false)}>Mouse Mode</button>
              <button className={`tool-button${camOn ? " active" : ""}`} onClick={enableCameraMode}>Camera Mode</button>
            </div>
            {skyViewMode !== "globe" && (
              <div className="mode-toggle" style={{ display: "flex", gap: 6 }}>
                <button className={`tool-button${mapMode === "pan" ? " active" : ""}`} onClick={() => setMapMode("pan")}>Pan</button>
                <button className={`tool-button${mapMode === "select" ? " active" : ""}`} onClick={() => setMapMode("select")}>Select</button>
              </div>
            )}
            <div className="toolbar-divider" />
            <div style={{ position: "relative" }}>
              <button className={`tool-button${layersOpen ? " active" : ""}`} onClick={() => setLayersOpen(!layersOpen)} aria-haspopup="true" aria-expanded={layersOpen}>
                <Icon name="layers" size={17} /> Layers <span className="count">{[layers.grid, layers.labels, layers.arcs].filter(Boolean).length}</span>
              </button>
              {layersOpen && (
                <div className="layers-pop" role="menu" aria-label="Map layers">
                  <label className="layer-row">
                    <input type="checkbox" checked={footprintsOn} onChange={(e) => setFootprintsOn(e.target.checked)} />
                    <span>SPHEREx footprints<small>Real observation outlines from SIA2 s_region</small></span>
                  </label>
                  <label className="layer-row">
                    <input type="checkbox" checked={cooGridOn} onChange={(e) => setCooGridOn(e.target.checked)} />
                    <span>Coordinate grid<small>Aladin cooGrid overlay</small></span>
                  </label>
                  <label className="layer-row">
                    <input type="checkbox" checked={reticleOn} onChange={(e) => setReticleOn(e.target.checked)} />
                    <span>Center reticle<small>Crosshair at field center</small></span>
                  </label>
                  <div style={{ borderTop: "1px solid var(--color-line)", marginTop: "8px", paddingTop: "8px" }}>
                    <div className="eyebrow" style={{ fontSize: "10px", marginBottom: "6px" }}>Decorative (legacy grid)</div>
                    <label className="layer-row"><input type="checkbox" checked={layers.grid} onChange={(event) => setLayers({ ...layers, grid: event.target.checked })} /><span>Graticule grid<small>RA/Dec lines</small></span></label>
                    <label className="layer-row"><input type="checkbox" checked={layers.labels} onChange={(event) => setLayers({ ...layers, labels: event.target.checked })} /><span>Coordinate labels<small>Degree markings</small></span></label>
                    <label className="layer-row"><input type="checkbox" checked={layers.arcs} onChange={(event) => setLayers({ ...layers, arcs: event.target.checked })} /><span>Constellation arcs<small>Decor only — not data</small></span></label>
                  </div>
                  <p className="hint-line">Grid/labels/arcs are illustrative only. Footprints and background are real sky data (see survey label).</p>
                </div>
              )}
            </div>
            <button className={`tool-button${camOn ? " active" : ""}`} onClick={() => { if (camOn) setCamOn(false); else enableCameraMode(); }} title="Open palm pans; pinch distance controls zoom; a steady pinch confirms a selection. Video is processed on this device only and is never uploaded.">
              <Icon name="camera" size={17} /> Camera <span className="count">{camOn ? "ON" : "OFF"}</span>
            </button>
            <IconButton icon="expand" label="Enter fullscreen" onClick={toggleFullscreen} />
            {camMsg && !camOn && (
              <span className="cam-status" role="alert">
                <Icon name="info" size={14} />
                <span>{camMsg}</span>
                <button className="text-button" onClick={enableCameraMode}>Retry camera</button>
              </span>
            )}
          </div>
        )}

        {activeNav === "Explore sky" && (
          <div className={`content-grid${detailsOpen ? "" : " details-closed"}`}>
            <section
              className="sky-panel"
              aria-label="Sky visualization"
              ref={skySectionRef}
              onWheel={(event) => { if (skyViewMode === "coverage") setZoom((z) => Math.min(100, Math.max(8, z + (event.deltaY < 0 ? 8 : -8)))); }}
            >
              <div className="sky-grid aladin-sky-grid" ref={skyBoxRef} style={{ background: "#04070f" }}>
                {skyViewMode === "globe" ? (
                <SpherexGlobe3D
                  onCenter={setSkyCenter}
                  onFov={setSkyFov}
                  onCursor={setSkyCursor}
                  onSelect={(ra, dec) => {
                    const rad = Number(regionRadius) || 0.05;
                    applySkySelection(ra, dec, rad, "map-click");
                  }}
                  onDoubleClick={(ra, dec) => {
                    const rad = Number(regionRadius) || 0.05;
                    const normRa = ((ra % 360) + 360) % 360;
                    const clampedR = Math.min(rad, 1);
                    applySkySelection(normRa, dec, clampedR, "map-click");
                    // Pass normalized coordinates directly to avoid stale closure
                    runRegionSearch(String(normRa.toFixed(5)), String(dec.toFixed(5)), String(clampedR.toFixed(4)));
                  }}
                  mode="pan"
                />
                ) : skyViewMode === "spherex" ? (
                <SpherexAllSky
                  onCenter={setSkyCenter}
                  onFov={setSkyFov}
                  onCursor={setSkyCursor}
                  selection={{
                    ra: Number(regionRa),
                    dec: Number(regionDec),
                  }}
                  onSelect={(ra, dec) => {
                    const rad = Number(regionRadius) || 0.05;
                    applySkySelection(ra, dec, rad, "map-click");
                  }}
                  onRect={(ra, dec, r) => {
                    applySkySelection(ra, dec, r, "map-rect");
                  }}
                  onDrag={(ra, dec, r) => {
                    clearRegionResults();
                    setRegionRa(String(+ra.toFixed(5)));
                    setRegionDec(String(+dec.toFixed(5)));
                    setRegionRadius(String(+r.toFixed(4)));
                    setSelMethod("map-rect");
                  }}
                  mode={mapMode}
                />
                ) : (
                <AladinSky
                  survey={skySurvey}
                  onSurveyBusy={setSkySurveyBusy}
                  onCenter={setSkyCenter}
                  onFov={setSkyFov}
                  onCursor={setSkyCursor}
                  onSelect={(ra, dec) => {
                    const rad = Number(regionRadius) || 0.05;
                    applySkySelection(ra, dec, rad, "map-click");
                    // If click falls inside a footprint polygon, select that observation.
                    for (const o of obsList) {
                      const fp = o.footprint;
                      if (fp?.kind === "polygon" && fp.vertices.length >= 3) {
                        if (pointInLonLatPolygon(ra, dec, fp.vertices as Array<[number, number]>)) {
                          setSelectedObs(o.obs_id);
                          break;
                        }
                      }
                    }
                  }}
                  onRect={(ra, dec, r, needConfirm) => {
                    if (needConfirm) setClampOffer({ ra, dec, asked: r * 1.6 });
                    applySkySelection(ra, dec, r, "map-rect");
                  }}
                  footprintsOn={footprintsOn}
                  mode={mapMode}
                  onDrag={(ra, dec, r) => {
                    clearRegionResults();
                    setRegionRa(String(+ra.toFixed(5)));
                    setRegionDec(String(+dec.toFixed(5)));
                    setRegionRadius(String(+r.toFixed(4)));
                    setSelMethod("map-rect");
                  }}
                  obsList={obsList}
                  selectedObs={selectedObs}
                  cooGridOn={cooGridOn}
                  reticleOn={reticleOn}
                  onReady={(al) => {
                    aladinInstanceRef.current = al;
                    if (al) {
                      setAladinState("ready");
                      setAladinError("");
                    }
                  }}
                  onLoadState={(s, msg) => {
                    setAladinState(s);
                    if (msg) setAladinError(msg);
                    else if (s !== "error") setAladinError("");
                  }}
                  onHipsStatus={(ok) => setHipsLive(ok)}
                  selection={
                    Number.isFinite(Number(regionRa)) && Number.isFinite(Number(regionDec)) && Number.isFinite(Number(regionRadius))
                      ? { ra: Number(regionRa), dec: Number(regionDec), radius: Number(regionRadius) }
                      : null
                  }
                />
                )}
                {/* Decorative fallback grid (legacy) shown only when Aladin fails */}
                {aladinState === "error" && layers.grid && skyViewMode === "coverage" && (
                  <div className="sky-layer nogrid-fallback" style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.35 }}>
                    <div className="axis axis--horizontal" />
                    <div className="axis axis--vertical" />
                  </div>
                )}
                {/* Clamp notice for oversized rectangles */}
                {clampOffer && (
                  <div className="clamp-notice" role="status" style={{ position: "absolute", left: 12, bottom: 48, background: "rgba(4,8,15,0.92)", border: "1px solid #26374b", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
                    Selected area exceeds 1.0° — clamped to 1.0° for the search.
                    <button className="text-button" style={{ marginLeft: 8 }} onClick={() => setClampOffer(null)}>Dismiss</button>
                  </div>
                )}
                {/* Coverage map legend — primary scientific visualization, not HiPS (coverage mode only) */}
                {skyViewMode === "coverage" && (<div
                  style={{
                    position: "absolute",
                    top: 10,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "rgba(4,8,15,0.92)",
                    border: "1px solid #26374b",
                    borderRadius: 999,
                    padding: "5px 12px",
                    fontSize: 10,
                    color: "#cbd5e1",
                    letterSpacing: ".04em",
                    zIndex: 3,
                    maxWidth: "92%",
                    textAlign: "center",
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ color: "#8b5cf6", fontWeight: 700 }}>SPHEREx Observation Coverage</span>
                  <span style={{ margin: "0 6px", color: "#26374b" }}>|</span>
                  <span style={{ color: "#65c8e8" }}>Selected Region</span> cyan
                  <span style={{ display: "block", fontSize: 9, color: "#8a93a6", marginTop: 2 }}>This map displays the sky regions covered by returned SPHEREx observations. It is a coverage visualization, not an all-sky SPHEREx image. Aitoff projection, ICRS.</span>
                </div>
                )}
                {/* No coverage empty state */}
                {skyViewMode === "coverage" && obsList.length === 0 && aladinState === "ready" && !skySurveyBusy && (
                  <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", background: "rgba(4,8,15,0.88)", border: "1px dashed #26374b", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#8a93a6", zIndex: 3, textAlign: "center" }}>
                    <strong style={{ display: "block", color: "#cbd5e1", marginBottom: 4 }}>No Observation Coverage Found</strong>
                    Search a region above to see returned SPHEREx footprints (purple polygons) on the Aitoff grid.
                  </div>
                )}
                {/* Background survey badge — optional HiPS enhancement, not blocking coverage (coverage mode only) */}
                {skyViewMode === "coverage" && (<div
                  style={{
                    position: "absolute",
                    left: 10,
                    bottom: 42,
                    background: "rgba(4,8,15,0.88)",
                    border: "1px solid #26374b",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 10,
                    color: "#8a93a6",
                    letterSpacing: ".04em",
                  }}
                >
                  {hipsLive === false || aladinState === "error" ? (
                    <>Local Preview — Not Live Survey Data<span style={{ display: "block", fontSize: 9, opacity: 0.8 }}>HiPS unavailable (CDS maintenance) — faint illustration only. Coverage and FITS previews remain functional. Use center Retry to re-probe.</span></>
                  ) : (
                    <>Background survey: {skySurvey === "CDS/P/2MASS/color" ? "2MASS All-Sky (near-infrared) — CDS/P/2MASS/color" : "DSS2 Color (optical) — CDS/P/DSS2/color"} {skySurveyBusy ? "· loading…" : hipsLive ? "· live" : "· checking…"}<span style={{ display: "block", fontSize: 9, opacity: 0.8 }}>Context only — not SPHEREx imagery. SPHEREx coverage is the purple footprints and FITS previews. AIT / ICRS.</span></>
                  )}
                </div>
                )}
                {/* Hand cursor when camera mode tracks */}
                {handCursor && camOn && handStatus === "tracking" && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: `${handCursor.x * 100}%`,
                      top: `${handCursor.y * 100}%`,
                      width: 18,
                      height: 18,
                      marginLeft: -9,
                      marginTop: -9,
                      borderRadius: "50%",
                      border: "2px solid #65c8e8",
                      boxShadow: "0 0 8px rgba(101,200,232,0.9)",
                      pointerEvents: "none",
                    }}
                  />
                )}
                {/* FITS preview no longer replaces the map; it lives in the Inspector (see details panel) */}
                {tileStatus === "ready" && tile && (
                  <div className="tile-wrap tile-wrap--pip" style={{ position: "absolute", right: 12, bottom: 12, width: 148, pointerEvents: "none" }}>
                    <img src={tile.url} alt={`Real SPHEREx DR1 cutout, observation ${tile.obs_id ?? "unknown"}`} style={{ width: "100%", borderRadius: 6 }} />
                    <span className="tile-cap" style={{ fontSize: 9 }}>
                      DR1 · {tile.obs_id ?? "unknown obs"} · D{tile.detector ?? "?"} · real SPHEREx cutout
                    </span>
                  </div>
                )}
                {/* All-sky viewer is the primary content; Inspector handles empty guidance */}
              </div>

              {skyViewMode === "coverage" && (
              <div className="map-controls">
                <IconButton
                  icon="plus"
                  label="Zoom in"
                  onClick={() => {
                    setZoom((z) => Math.min(100, z + 8));
                    const al = aladinInstanceRef.current;
                    if (al && skyFov) {
                      try {
                        al.setFoV(Math.max(0.5, skyFov * 0.7));
                      } catch {
                        /* best-effort */
                      }
                    }
                  }}
                />
                <div className="control-rule" />
                <IconButton
                  icon="minus"
                  label="Zoom out"
                  onClick={() => {
                    setZoom((z) => Math.max(8, z - 8));
                    const al = aladinInstanceRef.current;
                    if (al && skyFov) {
                      try {
                        al.setFoV(Math.min(180, skyFov * 1.4));
                      } catch {
                        /* best-effort */
                      }
                    }
                  }}
                />
                <div className="control-rule" />
                <IconButton icon="crosshair" label="Reset position" onClick={resetView} />
              </div>
              )}

              {camOn && (
                <div className="cam-pip" role="status" aria-label="Camera preview">
                  <video ref={videoRef} autoPlay muted playsInline />
                  <canvas ref={sampleRef} width={48} height={36} hidden />
                  <span>
                    {camMsg ? camMsg : handStatus === "loading" ? "Loading hand model…" : handStatus === "tracking" ? `Tracking · ${handHint || camGesture}` : handStatus === "no-hand" ? "No hand detected — show your hand" : handStatus === "error" ? handHint || "Hand tracking error — mouse still works" : camGesture || "Starting camera…"} · stays on this device
                  </span>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <button className="text-button" onClick={() => runRegionSearch()} disabled={obsStatus === "loading"}>Search selected region</button>
                    <button className="text-button" onClick={() => { setCamOn(false); }}>Turn OFF</button>
                  </div>
                  <div style={{ fontSize: 9, opacity: 0.85, marginTop: 4, lineHeight: 1.4 }}>
                    Point → sky position · Open palm → pan · Pinch distance → zoom · Hold steady to confirm once, then use Search selected region. Camera OFF by default; video stays on this device.
                  </div>
                </div>
              )}

              <div className="map-footer">
                <div className="coordinate-readout">
                  <span>Center</span>
                  <strong>{skyCenter ? `${skyCenter.ra.toFixed(3)}°, ${skyCenter.dec.toFixed(3)}°` : "— —"}</strong>
                  <i />
                  <span>Cursor</span>
                  <strong>{skyCursor ? `${skyCursor.ra.toFixed(3)}°, ${skyCursor.dec.toFixed(3)}°` : "— —"}</strong>
                  <i />
                  <span>FoV</span><strong>{skyFov ? `${skyFov.toFixed(1)}°` : "—"}</strong>
                </div>
                <div className="projection" title="Aitoff projection used by Aladin Lite for the all-sky background">Aitoff projection <Icon name="info" size={13} /></div>
              </div>
            </section>

            {detailsOpen ? (
              <aside className="details-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">Inspector · SPHEREx Observation Coverage</div>
                    <h3>Selected Region</h3>
                  </div>
                  <button className="close-button" aria-label="Close inspector" onClick={() => setDetailsOpen(false)}>×</button>
                </div>

                {regionSummary ? (
                  <div className="panel-section">
                    <dl className="kv-rows">
                      <div className="kv-row"><dt>RA</dt><dd className="mono-dim">{regionSummary.ra.toFixed(5)}°</dd></div>
                      <div className="kv-row"><dt>Dec</dt><dd className="mono-dim">{regionSummary.dec.toFixed(5)}°</dd></div>
                      <div className="kv-row"><dt>Radius</dt><dd className="mono-dim">{regionSummary.radius.toFixed(4)}°</dd></div>
                      <div className="kv-row"><dt>Observations</dt><dd className="mono-dim">{regionSummary.n_obs} distinct</dd></div>
                      {selMethod && <div className="kv-row"><dt>Selected via</dt><dd className="mono-dim">{selMethod === "map-click" ? "Map click" : selMethod === "map-rect" ? "Map rectangle" : selMethod === "camera" ? "Camera gesture" : "Manual input"}</dd></div>}
                    </dl>
                    <button className="text-button" style={{ marginTop: 10 }} onClick={() => { setRegionMsg(""); setRegionErrorKind(null); setRegionSummary(null); setObsList([]); setObsStatus("idle"); setSelectedObs(null); setTile(null); setTileStatus("idle"); }}>Clear selection</button>
                  </div>
                ) : (
                  <div className="panel-section">
                    <div className="selection-empty" style={{ paddingTop: 12, paddingBottom: 12 }}>
                      <div className="selection-icon"><Icon name="crosshair" size={22} /></div>
                      <h4>No region selected</h4>
                      <p>Enter RA, Dec and radius above, then Search to list real observations for closer inspection. Or click/drag on the sky map to pick a region.</p>
                    </div>
                  </div>
                )}

                <div className="panel-section">
                  <div className="section-title">
                    <span>Returned Observations</span>
                    <span className="section-number">{obsStatus === "ready" ? String(obsList.length) : "—"}</span>
                  </div>
                  <p className="hint-line" style={{ marginTop: -8, marginBottom: 8 }}>SPHEREx Observation Coverage — footprints from SIA2 <code>s_region</code>. Purple polygons = returned coverage; cyan = selected observation.</p>
                  {regionMsg && obsStatus !== "error" && <p className="hint-line" role="status">{regionMsg}</p>}
                  {obsStatus === "loading" && <p className="loading-row" role="status" aria-live="polite"><span className="spinner" /> Searching IRSA…</p>}
                  {obsStatus === "empty" && (
                    <div className="mini-empty">
                      <strong>No Observation Coverage Found</strong>
                      <p>No SPHEREx DR1 observations cover this Selected Region. Try a different RA/Dec or larger radius. This is a coverage visualization, not an all-sky image.</p>
                    </div>
                  )}
                  {obsStatus === "error" && (
                    <div className="mini-empty" role="alert">
                      <strong>
                        {regionErrorKind === "temporary"
                          ? "IRSA temporarily unavailable"
                          : regionErrorKind === "invalid"
                            ? "Invalid search parameters"
                            : "Search failed"}
                      </strong>
                      <p>{regionMsg || "The selected region could not be queried."}</p>
                      {regionErrorKind === "temporary" && (
                        <button className="text-button" onClick={() => runRegionSearch()}>
                          <Icon name="refresh" size={14} /> Retry search
                        </button>
                      )}
                    </div>
                  )}
                  {obsStatus === "ready" && (
                    <div className="obs-list">
                      {obsList.map((o) => (
                        <button
                          key={o.obs_id}
                          className={`obs-row${selectedObs === o.obs_id ? " active" : ""}${o.has_access ? "" : " no-access"}`}
                          onClick={() => o.has_access && loadObservation(o.obs_id)}
                          disabled={!o.has_access}
                          title={o.has_access ? "Load this observation" : "No usable FITS access for this observation"}
                        >
                          <span className="mono-dim">{o.obs_id}</span>
                          <span className="obs-meta">
                            D{o.detector ?? "?"} · {o.access_format ?? "?"}
                            {o.has_access ? "" : " · no access"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {tileStatus === "ready" && tile && (
                  <div className="panel-section">
                    <div className="section-title">
                      <span>FITS Preview</span>
                      <span className="section-number">00</span>
                    </div>
                    <p className="hint-line" style={{ marginTop: -8, marginBottom: 8 }}>Real SPHEREx DR1 cutout (117×117 preview) — not an illustration. Displayed separately from the coverage map.</p>
                    <div style={{ border: "1px solid var(--color-line)", borderRadius: 8, overflow: "hidden", background: "#04070f", marginBottom: 10 }}>
                      <img src={tile.url} alt={`FITS preview ${tile.obs_id ?? ""}`} style={{ width: "100%", display: "block", imageRendering: "auto" }} />
                    </div>
                    <dl className="kv-rows">
                      <div className="kv-row"><dt>Obs ID</dt><dd className="mono-dim">{tile.obs_id ?? "—"}</dd></div>
                      <div className="kv-row"><dt>Detector / band</dt><dd className="mono-dim">D{tile.detector ?? "?"} / band {tile.band ?? "?"}</dd></div>
                      <div className="kv-row"><dt>Cutout size</dt><dd className="mono-dim">{tile.shape.length === 2 ? `${tile.shape[0]} × ${tile.shape[1]} px` : "—"}</dd></div>
                      <div className="kv-row"><dt>Units</dt><dd className="mono-dim">{tile.unit || "—"}</dd></div>
                      <div className="kv-row"><dt>Centre (WCS)</dt><dd className="mono-dim">{tile.center ? `${tile.center[0].toFixed(3)}°, ${tile.center[1].toFixed(3)}°` : "—"}</dd></div>
                    </dl>
                    <button className="text-button" style={{ marginTop: 8 }} onClick={() => { setTile(null); setTileStatus("idle"); }}>Close preview (keep map)</button>
                  </div>
                )}
                {tileStatus === "loading" && <p className="loading-row"><span className="spinner" /> Loading FITS preview…</p>}
                {tileStatus === "unavailable" && (
                  <div className="data-notice" role="alert" style={{ marginTop: 8 }}>
                    <Icon name="info" size={16} />
                    <div><strong>Preview unavailable</strong><span>This observation has no retrievable FITS cutout (HTTP 502 from the cutout service). Try another observation in the list — other observations in the same region usually load.</span></div>
                  </div>
                )}
                <div className="panel-section">
                  <div className="section-title">
                    <span>Temporal comparison</span>
                    <span className="section-number">01</span>
                  </div>
                  <p className="hint-line">Epoch comparison runs in Compare Observations: pick two observations in one band and the backend computes later − earlier with PSF matching.</p>
                  {selectedObs ? (
                    <p className="hint-line">Selected as a starting point: <strong className="mono-dim">{selectedObs}</strong> — choose it again there, then pick its pair.</p>
                  ) : (
                    <p className="hint-line">Select an observation below, then continue in Compare Observations.</p>
                  )}
                  <div className="layout-row" style={{ marginTop: "8px" }}>
                    <button className="tool-button" onClick={() => setActiveNav("Compare observations")}>Open Compare Observations <Icon name="arrow" size={14} /></button>
                  </div>
                </div>

                <div className="panel-section">
                  <div className="section-title">
                    <span>Potential changes</span>
                    <span className="section-number">02</span>
                  </div>
                  <div className="mini-empty">
                    <div className="change-symbol"><span /><span /><span /></div>
                    <strong>No analysis available</strong>
                    <p>Change indicators will appear here after two observations are selected.</p>
                  </div>
                </div>

                <div className="panel-section panel-section--last">
                  <div className="section-title">
                    <span>Candidate objects</span>
                    <span className="section-number">03</span>
                  </div>
                  <div className="objects-row"><span>Objects in region</span><strong>—</strong></div>
                </div>
              </aside>
            ) : (
              <button className="open-panel" onClick={() => setDetailsOpen(true)} aria-label="Open region details">
                <Icon name="panel" />
              </button>
            )}
          </div>
        )}

        {activeNav === "Compare observations" && (
          <div className="page-wrap">
            <p className="page-lede">Compare two real SPHEREx DR1 observations of the same region in the same band at different epochs. Every observation ID, date, wavelength and measurement below comes from live archive metadata — nothing is simulated. The difference image is a diagnostic product, not a validated discovery.</p>

            <div className="info-card">
              <div className="card-head">
                <h3>1 · Region &amp; available observations</h3>
                <span className={`pill${cmpStatus === "ready" ? " info" : ""}`}>
                  {cmpStatus === "ready" ? `${cmpBands.length} band group${cmpBands.length === 1 ? "" : "s"}` : "live SIA2 query"}
                </span>
              </div>
              <div className="region-inputs">
                <label className="rg-field"><span>RA (deg)</span><input value={cmpRa} onChange={(e) => setCmpRa(e.target.value)} inputMode="decimal" aria-label="Right ascension in degrees" /></label>
                <label className="rg-field"><span>Dec (deg)</span><input value={cmpDec} onChange={(e) => setCmpDec(e.target.value)} inputMode="decimal" aria-label="Declination in degrees" /></label>
                <label className="rg-field"><span>Radius (deg)</span><input value={cmpRadius} onChange={(e) => setCmpRadius(e.target.value)} inputMode="decimal" aria-label="Search radius in degrees" /></label>
                <button className="tool-button" onClick={runCompareSearch}><Icon name="search" size={16} /> Find observations</button>
              </div>
              <p className="hint-line">Searches IRSA SIA2 for real DR1 spectral images. The comparison cutout is 0.2°; both epochs must cover the same sky footprint.</p>
              {cmpMsg && <p className="hint-line" role="status">{cmpMsg}</p>}

              {cmpStatus === "loading" && <p className="hint-line">Querying IRSA for real DR1 observations…</p>}
              {cmpStatus === "empty" && (
                <div className="mini-empty">
                  <strong>No observations</strong>
                  <p>No SPHEREx DR1 rows cover this region. Try another coordinate or a larger radius.</p>
                </div>
              )}
              {cmpStatus === "error" && (
                <div className="mini-empty">
                  <strong>Search failed</strong>
                  <p>Could not query the archive. Check the backend and try again.</p>
                </div>
              )}

              {cmpStatus === "ready" && (
                <>
                  <div className="cmp-band-row">
                    <span className="eyebrow">Band</span>
                    <div className="cmp-chips">
                      {cmpBands.map((b) => (
                        <button
                          key={`band-${b.band ?? "none"}`}
                          className={`tool-button${cmpBand === b.band ? " active" : ""}`}
                          onClick={() => applyBand(b.band, cmpBands, cmpMinSep)}
                          title="Temporal comparison is only valid within one band"
                        >
                          D{b.band ?? "?"} <span className="count">{b.n_observations}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {cmpPairs.length > 0 && (
                    <div className="cmp-suggest">
                      <span className="eyebrow">Suggested real pairs</span>
                      <div className="cmp-chips">
                        {cmpPairs.slice(0, 4).map((p) => (
                          <button
                            key={`pair-${p.band}-${p.obs_id_earlier}-${p.obs_id_later}`}
                            className="tool-button"
                            onClick={() => {
                              applyBand(p.band, cmpBands, cmpMinSep);
                              setCmpA(p.obs_id_earlier);
                              setCmpB(p.obs_id_later);
                            }}
                            title={`Same band D${p.band}; separation ${p.dt_days.toFixed(2)} days`}
                          >
                            D{p.band ?? "?"} · {p.dt_days.toFixed(1)} d
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {cmpStatus === "ready" && cmpSelectedBand && (
              <div className="info-card">
                <div className="card-head">
                  <h3>2 · Epochs</h3>
                  <span className="sub">same band D{cmpBand ?? "?"} · difference = later − earlier</span>
                </div>
                <div className="cmp-select-row">
                  <label className="cmp-field">
                    <span>Observation A</span>
                    <select className="cmp-select" value={cmpA} onChange={(e) => pickCmpA(e.target.value)}>
                      <option value="">Select an observation…</option>
                      {cmpSelectedBand.observations.map((o) => (
                        <option key={`a-${o.obs_id}`} value={o.obs_id} disabled={!o.has_access || o.t_min_mjd === null}>
                          {o.obs_id} · {fmtDate(o.obs_date_utc)} · MJD {fmtNum(o.t_min_mjd, 3)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="cmp-field">
                    <span>Observation B</span>
                    <select className="cmp-select" value={cmpB} onChange={(e) => pickCmpB(e.target.value)}>
                      <option value="">Select an observation…</option>
                      {cmpSelectedBand.observations.map((o) => (
                        <option key={`b-${o.obs_id}`} value={o.obs_id} disabled={!o.has_access || o.t_min_mjd === null}>
                          {o.obs_id} · {fmtDate(o.obs_date_utc)} · MJD {fmtNum(o.t_min_mjd, 3)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="tool-button cmp-run" onClick={runCompare} disabled={cmpRun === "loading"}>
                    <Icon name="compare" size={16} /> {cmpRun === "loading" ? "Comparing…" : "Run comparison"}
                  </button>
                </div>
                {cmpSepDays !== null && (
                  <p className="hint-line">
                    Real separation: {cmpSepDays.toFixed(3)} days ({fmtDate(cmpObsA?.obs_date_utc)} → {fmtDate(cmpObsB?.obs_date_utc)}).
                    Minimum accepted separation is {cmpMinSep} days; the backend orders the pair by MJD, uses the earlier epoch as the reference pixel grid and always computes later − earlier.
                  </p>
                )}
                <p className="hint-line">Observation IDs are not unique on their own: SIA2 returns one row per detector band, so the band is sent explicitly and validated server-side.</p>
              </div>
            )}

            {cmpRun === "loading" && (
              <div className="info-card">
                <p className="loading-row"><span className="spinner" /> Fetching both real cutouts, reprojecting, matching the PSF and computing the difference…</p>
              </div>
            )}
            {cmpRun === "error" && (
              <div className="data-notice" role="alert">
                <Icon name="info" size={16} />
                <div><strong>Comparison not produced</strong><span>{cmpError}</span></div>
                <div className="layout-row" style={{ marginTop: "8px" }}>
                  <button className="tool-button" onClick={runCompare}>Retry with the same pair</button>
                </div>
              </div>
            )}

            {cmpRun === "ready" && cmpResult && (
              <>
                <div className="info-card">
                  <div className="card-head">
                    <h3>3 · Image comparison</h3>
                    <div className="layout-row cmp-layout-row">
                      <button className={`tool-button${compareLayout === "side" ? " active" : ""}`} onClick={() => setCompareLayout("side")}>Side-by-side</button>
                      <button className={`tool-button${compareLayout === "slider" ? " active" : ""}`} onClick={() => setCompareLayout("slider")}>Slider</button>
                    </div>
                  </div>

                  {compareLayout === "side" ? (
                    <div className="compare-grid2">
                      <div className="cmp-panel">
                        <div className="card-head">
                          <h3>Earlier · {cmpResult.observations.earlier.obs_id}</h3>
                          <span className="pill">{fmtDate(cmpResult.observations.earlier.obs_date_utc)}</span>
                        </div>
                        <div className="cmp-img-wrap">
                          <img className="cmp-img" src={`${API_BASE}${cmpResult.images.earlier}`} alt={`Earlier epoch ${cmpResult.observations.earlier.obs_id}`} />
                        </div>
                        <p className="hint-line">Grayscale stretch 0.5–99.5% of valid pixels on the reference grid.</p>
                      </div>
                      <div className="cmp-panel">
                        <div className="card-head">
                          <h3>Later · {cmpResult.observations.later.obs_id}</h3>
                          <span className="pill">{fmtDate(cmpResult.observations.later.obs_date_utc)}</span>
                        </div>
                        <div className="cmp-img-wrap">
                          <img className="cmp-img" src={`${API_BASE}${cmpResult.images.later}`} alt={`Later epoch ${cmpResult.observations.later.obs_id}`} />
                        </div>
                        <p className="hint-line">Reprojected onto the earlier epoch's WCS, then PSF-matched before subtraction.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="cmp-slider-block">
                      <div className="cmp-slider-stage">
                        <img className="cmp-slider-img" src={`${API_BASE}${cmpResult.images.later}`} alt={`Later epoch ${cmpResult.observations.later.obs_id}`} />
                        <img
                          className="cmp-slider-img"
                          src={`${API_BASE}${cmpResult.images.earlier}`}
                          alt={`Earlier epoch ${cmpResult.observations.earlier.obs_id}`}
                          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                        />
                        <div className="cmp-slider-divider" style={{ left: `${sliderPos}%` }} />
                        <span className="cmp-slider-tag cmp-slider-tag--left">Earlier</span>
                        <span className="cmp-slider-tag cmp-slider-tag--right">Later</span>
                      </div>
                      <input
                        type="range"
                        className="slider-input"
                        min={0}
                        max={100}
                        value={sliderPos}
                        onChange={(event) => setSliderPos(Number(event.target.value))}
                        aria-label="Comparison slider"
                      />
                      <p className="hint-line">Drag the handle to reveal the earlier epoch over the later epoch. Both frames share one pixel grid.</p>
                    </div>
                  )}
                  <p className="hint-line">Images are rendered server-side as PNG from the real FITS cutouts. No FITS file or archive credential reaches the browser.</p>
                </div>

                <div className="cmp-diff-grid">
                  <div className="info-card">
                    <div className="card-head"><h3 title="ZODI is a zodiacal-light foreground model delivered with each cutout. Subtracting it removes most of the background offset so the difference shows sky change, but model error remains.">ZODI-subtracted difference</h3><span className="pill info">later − earlier</span></div>
                    {cmpResult.images.difference ? (
                      <div className="cmp-img-wrap"><img className="cmp-img" src={`${API_BASE}${cmpResult.images.difference}`} alt="ZODI-subtracted difference image" /></div>
                    ) : (
                      <div className="mini-empty"><strong>ZODI unavailable</strong><p>Only the raw difference is shown.</p></div>
                    )}
                    <dl className="kv-rows cmp-kv">
                      <div className="kv-row"><dt>Median Δ</dt><dd>{fmtNum(cmpResult.difference.stats_zodi_subtracted?.median, 4)} {cmpResult.observations.earlier.unit ?? ""}</dd></div>
                      <div className="kv-row"><dt title="Robust sigma (1.4826 × MAD) describes the quiet bulk of pixels; bright sources inflate the plain std, so the robust value is the honest noise scale.">Robust σ (bulk)</dt><dd>{fmtNum(cmpResult.difference.stats_zodi_subtracted?.robust_sigma, 4)}</dd></div>
                      <div className="kv-row"><dt>Valid pixels</dt><dd>{(cmpResult.difference.valid_fraction * 100).toFixed(1)}%</dd></div>
                      <div className="kv-row"><dt>Display scale</dt><dd>±{fmtNum(Math.abs(cmpResult.difference.display_limits?.vmax ?? 0), 4)}</dd></div>
                    </dl>
                  </div>
                  <div className="info-card">
                    <div className="card-head"><h3>Raw difference</h3><span className="pill">not background-corrected</span></div>
                    {cmpResult.images.difference_raw ? (
                      <div className="cmp-img-wrap"><img className="cmp-img" src={`${API_BASE}${cmpResult.images.difference_raw}`} alt="Raw difference image" /></div>
                    ) : (
                      <div className="mini-empty"><strong>Not available</strong><p>No raw difference image was produced.</p></div>
                    )}
                    <dl className="kv-rows cmp-kv">
                      <div className="kv-row"><dt>Median Δ</dt><dd>{fmtNum(cmpResult.difference.stats_raw?.median, 4)}</dd></div>
                      <div className="kv-row"><dt>Background Δ</dt><dd>{fmtNum(cmpResult.difference.background.delta_median, 4)}</dd></div>
                      <div className="kv-row"><dt>ZODI Δ</dt><dd>{fmtNum(cmpResult.difference.background.delta_zodi, 4)}</dd></div>
                      <div className="kv-row"><dt>Robust σ</dt><dd>{fmtNum(cmpResult.difference.stats_raw?.robust_sigma, 4)}</dd></div>
                    </dl>
                  </div>
                  <div className="info-card">
                    <div className="card-head"><h3 title="A per-pixel diagnostic: (later − earlier) / propagated noise. Useful for spotting outliers, but it is not a calibrated probability and ignores correlated noise.">Diagnostic significance</h3><span className="pill warn">not a detection</span></div>
                    {cmpResult.images.significance ? (
                      <div className="cmp-img-wrap"><img className="cmp-img" src={`${API_BASE}${cmpResult.images.significance}`} alt="Diagnostic significance-like map" /></div>
                    ) : (
                      <div className="mini-empty"><strong>Not available</strong><p>ZODI or variance was missing, so no significance map was produced.</p></div>
                    )}
                    <p className="hint-line">{cmpResult.difference.significance_stats?.label ?? "Not available."}</p>
                    <dl className="kv-rows cmp-kv">
                      <div className="kv-row"><dt>Robust σ</dt><dd>{fmtNum(cmpResult.difference.significance_stats?.robust_sigma, 3)}</dd></div>
                      <div className="kv-row"><dt>p99.9</dt><dd>{fmtNum(cmpResult.difference.significance_stats?.p999, 3)}</dd></div>
                      <div className="kv-row"><dt>Max</dt><dd>{fmtNum(cmpResult.difference.significance_stats?.max, 3)}</dd></div>
                    </dl>
                  </div>
                </div>

                <div className="info-card">
                  <div className="card-head"><h3>Observation metadata</h3><span className="sub">live SIA2 metadata + FITS headers</span></div>
                  <div className="cmp-table-wrap">
                    <table className="meta-table">
                      <thead><tr><th>Field</th><th>Earlier</th><th>Later</th></tr></thead>
                      <tbody>
                        <tr><td>Observation ID</td><td className="mono-dim">{cmpResult.observations.earlier.obs_id ?? "—"}</td><td className="mono-dim">{cmpResult.observations.later.obs_id ?? "—"}</td></tr>
                        <tr><td>UTC date (t_min)</td><td className="mono-dim">{fmtDate(cmpResult.observations.earlier.obs_date_utc)}</td><td className="mono-dim">{fmtDate(cmpResult.observations.later.obs_date_utc)}</td></tr>
                        <tr><td>MJD (t_min)</td><td className="mono-dim">{fmtNum(cmpResult.observations.earlier.t_min_mjd, 5)}</td><td className="mono-dim">{fmtNum(cmpResult.observations.later.t_min_mjd, 5)}</td></tr>
                        <tr><td>Band / detector</td><td className="mono-dim">D{cmpResult.observations.earlier.band ?? "?"} / {cmpResult.observations.earlier.detector ?? "?"}</td><td className="mono-dim">D{cmpResult.observations.later.band ?? "?"} / {cmpResult.observations.later.detector ?? "?"}</td></tr>
                        <tr><td>Wavelength range</td><td className="mono-dim">{fmtWavelength(cmpResult.observations.earlier.em_min_m, cmpResult.observations.earlier.em_max_m)}</td><td className="mono-dim">{fmtWavelength(cmpResult.observations.later.em_min_m, cmpResult.observations.later.em_max_m)}</td></tr>
                        <tr><td>Cutout shape</td><td className="mono-dim">{cmpResult.observations.earlier.shape.join(" × ")} px</td><td className="mono-dim">{cmpResult.observations.later.shape.join(" × ")} px</td></tr>
                        <tr><td>Units</td><td className="mono-dim">{cmpResult.observations.earlier.unit ?? "—"}</td><td className="mono-dim">{cmpResult.observations.later.unit ?? "—"}</td></tr>
                        <tr><td>HDUs (by name)</td><td className="mono-dim">{cmpResult.observations.earlier.hdu_names.join(", ")}</td><td className="mono-dim">{cmpResult.observations.later.hdu_names.join(", ")}</td></tr>
                        <tr><td>Masked flag types</td><td className="mono-dim">{Object.keys(cmpResult.observations.earlier.flag_counts).length ? Object.keys(cmpResult.observations.earlier.flag_counts).join(", ") : "none set"}</td><td className="mono-dim">{Object.keys(cmpResult.observations.later.flag_counts).length ? Object.keys(cmpResult.observations.later.flag_counts).join(", ") : "none set"}</td></tr>
                        <tr><td>ePSF σ (native px)</td><td className="mono-dim">{fmtNum(cmpResult.observations.earlier.psf?.sigma_px, 4)}</td><td className="mono-dim">{fmtNum(cmpResult.observations.later.psf?.sigma_px, 4)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="compare-grid2">
                  <div className="info-card">
                    <div className="card-head"><h3 title="The sharper epoch is convolved with a Gaussian kernel so both epochs share the broader measured PSF. Undersampled pixels make this an approximation; residual mismatch can mimic change near bright sources.">PSF matching</h3><span className={`pill${cmpResult.psf.status === "matched" ? " info" : " warn"}`}>{cmpResult.psf.status}</span></div>
                    <dl className="kv-rows">
                      <div className="kv-row"><dt>σ earlier</dt><dd>{fmtNum(cmpResult.psf.sigma_a_px, 4)} px</dd></div>
                      <div className="kv-row"><dt>σ later</dt><dd>{fmtNum(cmpResult.psf.sigma_b_px, 4)} px</dd></div>
                      <div className="kv-row"><dt>Matching kernel σ</dt><dd>{fmtNum(cmpResult.psf.matching_sigma_px, 4)} px</dd></div>
                      <div className="kv-row"><dt>σ after matching</dt><dd>{fmtNum(cmpResult.psf.sigma_after_px, 4)} px</dd></div>
                      <div className="kv-row"><dt>Residual</dt><dd>{typeof cmpResult.psf.residual_sigma_fraction === "number" ? `${(cmpResult.psf.residual_sigma_fraction * 100).toFixed(2)}%` : "—"}</dd></div>
                    </dl>
                    <p className="hint-line">{cmpResult.psf.policy}</p>
                    {cmpResult.psf.detail && <p className="hint-line">{cmpResult.psf.detail}</p>}
                  </div>
                  <div className="info-card">
                    <div className="card-head"><h3>Alignment &amp; masks</h3><span className="pill info">{(cmpResult.alignment.coverage_fraction * 100).toFixed(1)}% covered</span></div>
                    <dl className="kv-rows">
                      <div className="kv-row"><dt>Reference grid</dt><dd>{cmpResult.alignment.reference}</dd></div>
                      <div className="kv-row"><dt title="Share of reference-grid pixels that survive masking, reprojection coverage, and finite-value checks in both epochs.">Valid overlap</dt><dd>{(cmpResult.difference.valid_fraction * 100).toFixed(1)}%</dd></div>
                      <div className="kv-row"><dt>Benign bits kept</dt><dd>{cmpResult.masks.benign_bits.join(", ")} (FULLSAMPLE, SOURCE)</dd></div>
                      <div className="kv-row"><dt>Masking bits</dt><dd>{cmpResult.masks.masking_bits.join(", ")}</dd></div>
                    </dl>
                    <p className="hint-line">{cmpResult.masks.policy}</p>
                    <p className="hint-line">Flag source: {cmpResult.masks.source}. {cmpResult.alignment.note}</p>
                  </div>
                </div>

                <div className="info-card">
                  <div className="card-head"><h3>Provenance</h3><span className="sub">pipeline {cmpResult.pipeline_version} · job {cmpResult.job_id}</span></div>
                  <dl className="kv-rows">
                    <div className="kv-row"><dt>Source</dt><dd>{cmpResult.provenance.source}</dd></div>
                    <div className="kv-row"><dt>Region</dt><dd>RA {fmtNum(cmpResult.region.ra, 5)}°, Dec {fmtNum(cmpResult.region.dec, 5)}° · {cmpResult.region.collection}</dd></div>
                    <div className="kv-row"><dt>Cutout size</dt><dd>{cmpResult.provenance.cutout_size_deg}°</dd></div>
                    <div className="kv-row"><dt>HDU resolution</dt><dd>{cmpResult.provenance.hdu_resolution}</dd></div>
                    <div className="kv-row"><dt>Difference convention</dt><dd>{cmpResult.difference.convention}</dd></div>
                    <div className="kv-row"><dt>Epoch separation</dt><dd>{fmtNum(cmpResult.epoch_separation_days, 3)} days</dd></div>
                    <div className="kv-row"><dt>Alignment method</dt><dd>{cmpResult.alignment.method}</dd></div>
                  </dl>
                </div>

                {cmpResult.warnings.length > 0 && (
                  <div className="cmp-warnings">
                    {cmpResult.warnings.map((w, i) => (
                      <div className="data-notice" key={`cmp-warn-${i}`}>
                        <Icon name="info" size={16} />
                        <div><strong>Data caveat</strong><span>{w}</span></div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="hint-line">Interpretation guardrail: this is a diagnostic image difference between two real observations. It is not a validated scientific difference image, and no pixel is classified as a candidate, a source detection or a planet.</p>
              </>
            )}
          </div>
        )}

        {activeNav === "Change Detection" && (
          <div className="page-wrap">
            <p className="page-lede">Change detection here means comparing observations of the same sky region, in the same spectral band but at different times, to find unusual positive or negative residuals. A candidate residual is not a confirmed astronomical object — it only marks somewhere that deserves a closer look.</p>

            <div className="info-card">
              <div className="card-head"><h3>How the workflow runs</h3><span className="sub">uses Compare + Candidate Objects — no separate detector</span></div>
              <dl className="kv-rows">
                <div className="kv-row"><dt>1 · Select</dt><dd>observations from different epochs (Compare Observations)</dd></div>
                <div className="kv-row"><dt>2 · Generate</dt><dd>a temporal comparison, later − earlier (Compare Observations)</dd></div>
                <div className="kv-row"><dt>3 · Inspect</dt><dd>the difference products and diagnostics (Compare Observations)</dd></div>
                <div className="kv-row"><dt>4 · Run</dt><dd>candidate residual detection on the stored job (Candidate Objects)</dd></div>
                <div className="kv-row"><dt>5 · Review</dt><dd>candidate measurements and quality flags (Candidate Objects)</dd></div>
                <div className="kv-row"><dt>6 · Decide</dt><dd>whether a candidate deserves further validation — nothing here is a discovery</dd></div>
              </dl>
            </div>

            <div className="info-card">
              <div className="card-head">
                <h3>Workflow status</h3>
                <span className={`pill${candJobsStatus === "ready" ? " info" : ""}`}>
                  {candJobsStatus === "ready" ? `${candJobs.length} stored job${candJobs.length === 1 ? "" : "s"}` : "live job list"}
                </span>
              </div>
              {candJobsStatus === "loading" && <p className="hint-line">Listing stored comparison jobs…</p>}
              {candJobsStatus === "error" && (
                <div className="mini-empty">
                  <strong>Job listing failed</strong>
                  <p>Could not reach the backend. Check that it is running and try again.</p>
                  <button className="text-button" onClick={loadCandJobs}>Retry listing</button>
                </div>
              )}
              {candJobsStatus === "empty" && (
                <div className="mini-empty">
                  <strong>No comparison jobs yet</strong>
                  <p>Run a temporal comparison first — detection consumes its numerical products.</p>
                </div>
              )}
              {candJobsStatus === "ready" && candJobs.length > 0 && (
                <>
                  <label className="cmp-field" style={{ maxWidth: "560px" }}>
                    <span>Comparison job</span>
                    <select className="cmp-select" value={candJobId} onChange={(e) => setCandJobId(e.target.value)} aria-label="Comparison job">
                      {candJobs.map((j) => (
                        <option key={j.job_id} value={j.job_id} disabled={!j.has_products}>
                          {j.job_id.slice(0, 12)}… · D{j.band ?? "?"} · {j.obs_earlier ?? "?"} → {j.obs_later ?? "?"}{j.has_products ? (j.has_detection ? " · detected" : "") : " (no numerical products — rerun comparison)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <dl className="kv-rows cmp-kv">
                    <div className="kv-row"><dt>Candidate detection</dt><dd>
                      {chgDet === null && "Checking cached result…"}
                      {chgDet !== null && !chgDet.ok && "Not run yet for this job."}
                      {chgDet !== null && chgDet.ok && `${chgDet.total} candidate residual${chgDet.total === 1 ? "" : "s"} (+${chgDet.positive} positive · −${chgDet.negative} negative)`}
                    </dd></div>
                  </dl>
                </>
              )}
              <div className="layout-row" style={{ marginTop: "10px", flexWrap: "wrap" }}>
                <button className="tool-button" onClick={() => setActiveNav("Compare observations")}><Icon name="compare" size={16} /> Start comparison</button>
                <button className="tool-button" onClick={() => setActiveNav("Candidate objects")}><Icon name="objects" size={16} /> Open candidate detection</button>
                {chgDet !== null && chgDet.ok && (
                  <button className="text-button" onClick={() => setActiveNav("Candidate objects")}>View results <Icon name="arrow" size={14} /></button>
                )}
              </div>
              <p className="hint-line">Counts come from the stored detection result for the selected job only — never invented. "View results" opens the same results in Candidate Objects.</p>
            </div>

            <div className="compare-grid2">
              <div className="info-card">
                <div className="card-head"><h3>Candidate detections</h3><span className="pill warn">illustrative on this page</span></div>
                <div className="mini-empty">
                  <div className="change-symbol"><span /><span /><span /></div>
                  <strong>No candidates</strong>
                  <p>This page holds no detection results. Run a comparison, then inspect real candidate residuals under Candidate Objects.</p>
                </div>
              </div>
              <div>
                <div className="info-card">
                  <div className="card-head"><h3>Change overlay</h3><span className="sub">planned concept — not active</span></div>
                  <div className="epoch-box">Overlay placeholder — no measurement behind it.</div>
                </div>
                <div className="info-card" style={{ marginTop: "16px" }}>
                  <div className="card-head"><h3>Confidence</h3><span className="sub">no scores on this page</span></div>
                  <p className="hint-line">Currently: no scores. Candidate statistics appear per candidate on the Candidate objects page.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeNav === "Candidate objects" && (
          <div className="page-wrap">
            <p className="page-lede">Evidence-based residual detection on a stored temporal comparison. Positive means the later epoch is brighter; negative means it is fainter. A candidate residual is not a discovery and requires further validation — it is never labelled a planet, transient or Planet X.</p>

            <div className="info-card">
              <div className="card-head">
                <h3>1 · Comparison job &amp; detection parameters</h3>
                <span className={`pill${candJobsStatus === "ready" ? " info" : ""}`}>
                  {candJobsStatus === "ready" ? `${candJobs.length} stored job${candJobs.length === 1 ? "" : "s"}` : "stored M2B jobs"}
                </span>
              </div>
              <div className="cmp-band-row">
                <button className="tool-button" onClick={loadCandJobs} disabled={candJobsStatus === "loading"}>
                  <Icon name="refresh" size={16} /> {candJobsStatus === "loading" ? "Listing…" : "Refresh jobs"}
                </button>
                {candJobsStatus === "ready" && candJobs.length > 0 && (
                  <label className="cmp-field" style={{ flex: "1 1 320px" }}>
                    <span>Comparison job</span>
                    <select className="cmp-select" value={candJobId} onChange={(e) => setCandJobId(e.target.value)} aria-label="Comparison job">
                      {candJobs.map((j) => (
                        <option key={j.job_id} value={j.job_id} disabled={!j.has_products}>
                          {j.job_id.slice(0, 12)}… · D{j.band ?? "?"} · {j.obs_earlier ?? "?"} → {j.obs_later ?? "?"}{j.has_products ? "" : " (no numerical products — rerun comparison)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {candJobsMsg && <p className="hint-line" role="status">{candJobsMsg}</p>}
              {candJobsStatus === "empty" && (
                <div className="mini-empty">
                  <strong>No comparison jobs</strong>
                  <p>Run a temporal comparison first. Detection consumes numerical difference products, never display pixels.</p>
                </div>
              )}
              {candJobsStatus === "error" && (
                <div className="mini-empty">
                  <strong>Job listing failed</strong>
                  <p>Could not reach the backend. Check that it is running and try again.</p>
                </div>
              )}

              {candJobsStatus === "ready" && candJobs.length > 0 && (
                <>
                  <div className="cand-params">
                    <label className="rg-field">
                      <span>Threshold (σ)</span>
                      <input value={candThr} onChange={(e) => setCandThr(e.target.value)} inputMode="decimal" aria-label="Detection threshold in sigma" />
                    </label>
                    <label className="rg-field">
                      <span>Min area (px)</span>
                      <input value={candMinArea} onChange={(e) => setCandMinArea(e.target.value)} inputMode="numeric" aria-label="Minimum connected pixel area" />
                    </label>
                    <label className="cand-check">
                      <input type="checkbox" checked={candDeblend} onChange={(e) => setCandDeblend(e.target.checked)} aria-label="Deblend nearby detections" />
                      <span>Deblend nearby peaks</span>
                    </label>
                    <button className="tool-button" onClick={runCandDetect} disabled={candRun === "loading" || !candJobId}>
                      <Icon name="objects" size={16} /> {candRun === "loading" ? "Detecting…" : "Run detection"}
                    </button>
                  </div>
                  <p className="hint-line">Threshold 3–10σ, minimum area 3–100 connected pixels. σ here means multiples of the local effective noise (propagated variance combined with background scatter) — a higher threshold keeps fewer, stronger residuals, so raising it can only reduce the count. Minimum area counts connected valid pixels; deblending splits nearby peaks that would otherwise merge. Detection runs on the ZODI-subtracted numerical difference with the M2B validity mask; reprojection and convolution correlate neighbouring pixels, so the statistic is diagnostic only — never a calibrated probability.</p>
                  <p className="hint-line">Both signs are always searched: positive means the later epoch is brighter, negative means it is fainter. Changing these values only takes effect when you run detection again.</p>
                </>
              )}
            </div>

            {candRun === "loading" && (
              <div className="info-card"><p className="loading-row"><span className="spinner" /> Segmenting positive and negative residuals with mask-aware photutils detection…</p></div>
            )}
            {candRun === "error" && (
              <div className="data-notice" role="alert">
                <Icon name="info" size={16} />
                <div><strong>Detection not produced</strong><span>{candError}</span></div>
              </div>
            )}

            {candRun === "ready" && candResult && (
              <>
                <div className="info-card">
                  <div className="card-head">
                    <h3>2 · Candidates: {candResult.counts.total} found</h3>
                    <span className="sub">+{candResult.counts.positive} positive · −{candResult.counts.negative} negative · {candResult.counts.rejected_edge} edge rejection{candResult.counts.rejected_edge === 1 ? "" : "s"}</span>
                  </div>
                  <p className="hint-line">
                    Difference source: {candResult.parameters.difference_source ?? "—"} · threshold {candResult.parameters.threshold_sigma.toFixed(1)}σ · min area {candResult.parameters.min_area} px · deblend {candResult.parameters.deblend ? "on" : "off"} · {candResult.counts.n_valid_pixels.toLocaleString()} valid pixels · background {fmtSci(candResult.method.background.median)} ± {fmtSci(candResult.method.background.rms)} {candResult.parameters.unit ?? ""} ({candResult.method.background.method}).
                  </p>
                  <div className="cmp-chips" role="group" aria-label="Sign filter">
                    {(["all", "positive", "negative"] as const).map((f) => (
                      <button key={f} className={`tool-button${candFilter === f ? " active" : ""}`} onClick={() => { setCandFilter(f); }}>
                        {f === "all" ? `All (${candResult.counts.total})` : f === "positive" ? `Positive (${candResult.counts.positive})` : `Negative (${candResult.counts.negative})`}
                      </button>
                    ))}
                  </div>
                  {candVisible.length === 0 ? (
                    <div className="mini-empty">
                      <strong>No candidate residuals pass</strong>
                      <p>Zero is an honest result: nothing above threshold survived masking, area and edge checks. Try a lower threshold or a different epoch pair — the absence of detections is preserved, never hidden.</p>
                    </div>
                  ) : (
                    <div className="cand-list" role="listbox" aria-label="Candidate residuals">
                      {candVisible.map((c) => (
                        <button
                          key={c.id}
                          role="option"
                          aria-selected={candSel === c.id}
                          className={`cand-item${candSel === c.id ? " active" : ""} cand-${c.sign}`}
                          onClick={() => setCandSel(candSel === c.id ? null : c.id)}
                        >
                          <span className="cand-id">{c.id}</span>
                          <span className={`pill${c.sign === "positive" ? " info" : " warn"}`}>{c.sign === "positive" ? "later brighter" : "later fainter"}</span>
                          <span className="cand-coord">RA {fmtNum(c.ra_deg, 5)}° · Dec {fmtNum(c.dec_deg, 5)}°</span>
                          <span className="cand-stat">stat {c.peak_stat >= 0 ? "+" : ""}{c.peak_stat.toFixed(2)}σ · {c.npix} px</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="compare-grid2">
                  <div className="info-card">
                    <div className="card-head"><h3>Candidate detail</h3><span className="sub">inspector</span></div>
                    {!candSelected ? (
                      <div className="mini-empty">
                        <strong>No candidate selected</strong>
                        <p>Select a candidate to inspect coordinates, measurements and quality flags.</p>
                      </div>
                    ) : (
                      <dl className="kv-rows">
                        <div className="kv-row"><dt>Identifier</dt><dd>{candSelected.id}</dd></div>
                        <div className="kv-row"><dt>Sign</dt><dd>{candSelected.sign === "positive" ? "positive — later epoch brighter" : "negative — later epoch fainter"}</dd></div>
                        <div className="kv-row"><dt>Coordinates</dt><dd>{candSelected.ra_deg !== null && candSelected.dec_deg !== null ? `RA ${candSelected.ra_deg.toFixed(5)}°, Dec ${candSelected.dec_deg.toFixed(5)}°` : `unavailable — ${candSelected.coord_null_reason ?? "no WCS solution"}`}</dd></div>
                        <div className="kv-row"><dt>Pixel centroid</dt><dd>{candSelected.x_pix !== null && candSelected.y_pix !== null ? `(${candSelected.x_pix.toFixed(2)}, ${candSelected.y_pix.toFixed(2)})` : "—"}</dd></div>
                        <div className="kv-row"><dt>Peak difference</dt><dd>{fmtSci(candSelected.peak_diff)} {candSelected.unit ?? ""}</dd></div>
                        <div className="kv-row"><dt>Detection statistic</dt><dd>{candSelected.peak_stat >= 0 ? "+" : ""}{candSelected.peak_stat.toFixed(2)}σ (diagnostic, not a probability)</dd></div>
                        <div className="kv-row"><dt>Integrated residual</dt><dd>{candSelected.flux_sum !== null ? `${fmtSci(candSelected.flux_sum)} ${candSelected.unit ?? ""}·px` : `unavailable — ${candSelected.flux_null_reason ?? "no estimate"}`}</dd></div>
                        <div className="kv-row"><dt>Background / noise</dt><dd>{fmtSci(candSelected.background)} / {fmtSci(candSelected.noise_local)} {candSelected.unit ?? ""}</dd></div>
                        <div className="kv-row"><dt>Valid pixels / boundary</dt><dd>{candSelected.npix} px · {candSelected.boundary_dist_pix !== null ? `${candSelected.boundary_dist_pix.toFixed(1)} px from edge` : "—"} · coverage {Math.round(candSelected.local_coverage * 100)}%</dd></div>
                        <div className="kv-row"><dt>Observation pair</dt><dd>{candSelected.obs_earlier ?? "—"} → {candSelected.obs_later ?? "—"} · D{candSelected.band ?? "?"}</dd></div>
                        <div className="kv-row"><dt>Epochs</dt><dd>MJD {fmtNum(candSelected.mjd_earlier, 3)} → {fmtNum(candSelected.mjd_later, 3)} · {fmtDate(candSelected.date_earlier)} → {fmtDate(candSelected.date_later)}</dd></div>
                        <div className="kv-row"><dt title="Transparent caution notes, not classifications. touches_masked / near_boundary / low_coverage point at measurement risk; psf_mismatch and correlated_noise warn that the residual may be an instrument or processing artefact rather than sky change; possible_artefact marks marginal or extreme cases for extra scrutiny.">Quality flags</dt><dd>{candSelected.quality_flags.length > 0 ? candSelected.quality_flags.join(", ") : "none"}</dd></div>
                      </dl>
                    )}
                  </div>
                  <div className="info-card">
                    <div className="card-head"><h3>Evidence</h3><span className="sub">earlier · later · difference</span></div>
                    {(() => {
                      const imgs = candResult.provenance.images;
                      const shape = candResult.parameters.shape;
                      const nx = shape && shape.length === 2 ? shape[1] : null;
                      const ny = shape && shape.length === 2 ? shape[0] : null;
                      const showMarker = candSelected !== null && candSelected.x_pix !== null && candSelected.y_pix !== null && nx !== null && ny !== null;
                      // Reference-grid pixels map to CSS with a top-left origin; clamp so
                      // an out-of-range centroid can never render outside the frame.
                      const clampPct = (v: number) => Math.max(0, Math.min(100, v));
                      const leftPct = showMarker && nx ? clampPct((Number(candSelected.x_pix) / nx) * 100) : 0;
                      const topPct = showMarker && ny ? clampPct((Number(candSelected.y_pix) / ny) * 100) : 0;
                      const frames: Array<{ label: string; url: string | null }> = [
                        { label: `Earlier · ${candResult.provenance.observations?.earlier.obs_id ?? ""}`, url: imgs.earlier },
                        { label: `Later · ${candResult.provenance.observations?.later.obs_id ?? ""}`, url: imgs.later },
                        { label: "Difference (later − earlier)", url: imgs.difference },
                      ];
                      return (
                        <div className="cand-evidence">
                          {frames.map((f) => (
                            <div className="cmp-panel" key={f.label}>
                              <div className="card-head"><h3>{f.label}</h3></div>
                              {f.url ? (
                                <div className="cmp-img-wrap cand-stage">
                                  <img className="cmp-img" src={`${API_BASE}${f.url}`} alt={f.label} />
                                  {showMarker && (
                                    <span
                                      className="cand-marker"
                                      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                                      title={candSelected.id}
                                      aria-label={`Selected candidate ${candSelected.id}`}
                                    />
                                  )}
                                </div>
                              ) : (
                                <div className="mini-empty"><strong>No frame</strong><p>Not produced for this job.</p></div>
                              )}
                            </div>
                          ))}
                          <p className="hint-line">The marker uses the real WCS-derived centroid on the reference pixel grid; it appears only where the coordinate transform is valid. Frames are the stored M2B evidence — detection itself ran on numerical arrays. Compare the earlier and later frames at the marker: a convincing residual is visible as a brightness change at the same grid position, while symmetric smudges around bright sources usually trace PSF-matching residuals.</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="info-card">
                  <div className="card-head"><h3>Provenance &amp; limitations</h3><span className="sub">job {candResult.compare_job_id.slice(0, 12)}…</span></div>
                  <dl className="kv-rows cmp-kv">
                    <div className="kv-row"><dt>Region</dt><dd>{candResult.provenance.region ? `RA ${candResult.provenance.region.ra.toFixed(6)}°, Dec ${candResult.provenance.region.dec.toFixed(6)}°, ${candResult.provenance.region.collection}` : "—"}</dd></div>
                    <div className="kv-row"><dt>Epoch separation</dt><dd>{candResult.provenance.epoch_separation_days !== null ? `${Number(candResult.provenance.epoch_separation_days).toFixed(3)} days` : "—"}</dd></div>
                    <div className="kv-row"><dt>PSF matching</dt><dd>{candResult.provenance.psf ? `${candResult.provenance.psf.status}${candResult.provenance.psf.residual_sigma_fraction !== undefined ? ` · residual ${(Number(candResult.provenance.psf.residual_sigma_fraction) * 100).toFixed(2)}%` : ""}` : "—"}</dd></div>
                    <div className="kv-row"><dt>Mask policy</dt><dd>{candResult.provenance.masks?.policy ?? "—"}</dd></div>
                    <div className="kv-row"><dt>Method</dt><dd>{candResult.method.segmentation}. {candResult.method.noise}.</dd></div>
                    <div className="kv-row"><dt>Generated</dt><dd>{candResult.generated_utc}</dd></div>
                  </dl>
                  <div className="cmp-warnings">
                    {candResult.warnings.map((w) => (
                      <p className="hint-line" key={w}>{w}</p>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeNav === "Learn" && (
          <div className="page-wrap">
            <div className="info-card">
              <div className="card-head"><span className="pill info">SPHEREx in context</span></div>
              <p className="body">SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer) is a NASA mission mapping the full sky in near-infrared light. Because it revisits the same regions, things that move or vary — comets, asteroids, stars, brown dwarfs, possibly new planets — reveal themselves by shifting between images.</p>
            </div>

            <div className="learn-grid">
              <div className="info-card">
                <div className="card-head"><h3>What is SPHEREx?</h3></div>
                <p className="body">A space telescope surveying the whole sky every six months, returning images of more than a billion objects. Repeats make motion and variability visible.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Near-infrared light</h3></div>
                <p className="body">Light just beyond human vision. It pierces dust and traces cool or distant objects — a complement to optical images.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Why 102 bands?</h3></div>
                <p className="body">Each narrow slice is one note of a spectrum. Together they fingerprint composition and behaviour far better than a single image.</p>
                <div className="band-strip" aria-hidden="true" />
                <div className="band-scale"><span>short IR</span><span>long IR</span></div>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>D1–D6 detector groups</h3></div>
                <p className="body">This app groups observations D1–D6 as the archive labels them — one detector and band per group. Temporal comparison always stays inside a single group; bands are never mixed as epochs.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Bands are not epochs</h3></div>
                <p className="body">A band is a wavelength slice; an epoch is an observation time. Change is measured between two times in the <em>same</em> band — comparing different bands would confuse colour with change.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Why revisit?</h3></div>
                <p className="body">One snapshot shows positions. Repeated snapshots show change: motion, brightening, fading, or something new.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Why shifts?</h3></div>
                <p className="body">Nearby asteroids and comets drift against background stars; geometry and brightness changes add apparent shifts. Aligned epochs reveal them.</p>
              </div>
              <div className="info-card">
                <div className="card-head"><h3>Scope and honesty</h3></div>
                <p className="body">Shows real SPHEREx DR1 imagery, temporal comparisons and candidate residuals with honest empty states. Never invents dates or claims discoveries. SPHEREx Vision is an independent participant project developed for NASA Space Apps Challenge. It is not affiliated with, endorsed by, or an official product of NASA.</p>
              </div>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Understanding astronomical images</h3><span className="sub">what the app actually reads</span></div>
              <dl className="kv-rows cmp-kv">
                <div className="kv-row"><dt>FITS file</dt><dd>The standard container for astronomy images: binary pixel data plus a text header describing what the pixels mean.</dd></div>
                <div className="kv-row"><dt>HDU</dt><dd>A "header-data unit" — one named section inside a FITS file. Each cutout this app fetches carries IMAGE, FLAGS, VARIANCE, ZODI and EPSF sections plus a wavelength table, located by name, never by position.</dd></div>
                <div className="kv-row"><dt>IMAGE / FLAGS / VARIANCE</dt><dd>Sky brightness pixels; a bit-mask of detector defects (masked except FULLSAMPLE and SOURCE bits); and a per-pixel uncertainty map used to propagate noise.</dd></div>
                <div className="kv-row"><dt>ZODI</dt><dd>A zodiacal-light foreground model shipped with each cutout. Subtracting it removes most of the background offset, but model error remains — it is a correction, not a proof of clean data.</dd></div>
                <div className="kv-row"><dt>EPSF</dt><dd>The measured effective point-spread function: how a point of light spreads over pixels in that detector region. The optics undersample it, so matching PSFs between epochs is only approximate.</dd></div>
                <div className="kv-row"><dt>MJy / sr</dt><dd>Surface brightness: megajanskys per steradian. Every flux number in this app keeps these units; summed "integrated" values are pixel sums, not calibrated photometry.</dd></div>
                <div className="kv-row"><dt>WCS</dt><dd>The world-coordinate solution in each header that maps pixel positions to sky coordinates (RA/Dec). All candidate coordinates come from the real stored WCS.</dd></div>
              </dl>
              <details>
                <summary>Why do images look different after reprojection?</summary>
                <p className="hint-line">To compare epochs pixel-by-pixel, the later image is resampled onto the earlier epoch's grid (bilinear interpolation). Resampling correlates neighbouring pixels and the uncovered rim is masked, never interpolated as data — so the difference map is sharper in coverage than in noise behaviour.</p>
              </details>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Understanding temporal comparison</h3><span className="sub">the Compare Observations workflow</span></div>
              <p className="body">Earlier means the smaller observation date (MJD); it always defines the reference pixel grid. Later means the larger date. The difference is computed strictly as <strong>later − earlier</strong>: positive (red) pixels are brighter later, negative (blue) pixels fainter.</p>
              <dl className="kv-rows cmp-kv">
                <div className="kv-row"><dt>Same region, same band</dt><dd>Both epochs must cover the same sky in the same detector band D1–D6, separated by at least 0.5 days so dithers inside one visit are not mistaken for epochs.</dd></div>
                <div className="kv-row"><dt>Alignment</dt><dd>Reprojection plus PSF matching (convolve the sharper epoch, never deconvolve) put both epochs on one grid with one effective resolution.</dd></div>
                <div className="kv-row"><dt>Background</dt><dd>Median sky levels and the ZODI model are compared first; the primary product is the ZODI-subtracted difference, with the raw difference kept alongside for transparency.</dd></div>
                <div className="kv-row"><dt>Both signs matter</dt><dd>A new or brightened source leaves a positive residual; a faded or departed one leaves a negative residual. Instrumental effects — PSF-mismatch wings around bright stars, correlated noise — can mimic either, which is why every result ships with quality flags.</dd></div>
              </dl>
              <p className="hint-line">Open it: <button className="text-button" onClick={() => setActiveNav("Compare observations")}>Compare observations <Icon name="arrow" size={14} /></button></p>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>What you see in Explore Sky</h3><span className="sub">real sky, layered honestly</span></div>
              <p className="body">The all-sky background is <strong>not SPHEREx imagery</strong>. It is a real astronomical survey delivered as HiPS tiles via Aladin Lite: by default <strong>2MASS Color (near-infrared, CDS/P/2MASS/color)</strong>, alternatively <strong>DSS2 Color (optical, P/DSS2/color)</strong>. Both are independent all-sky surveys used here only for navigation.</p>
              <p className="body">SPHEREx data appears in two other layers: <strong>purple footprints</strong> are the actual observation polygons returned by IRSA SIA2 for your searched region, and <strong>FITS previews</strong> are the real cutout pixels fetched for the selected observation. Keeping the three layers distinct — background for context, footprints for coverage, FITS for detail — is how this app stays scientifically honest.</p>
              <p className="hint-line">Background: 2MASS (J/H/Ks near-infrared) and DSS2 (photographic optical) via CDS HiPS. SPHEREx: DR1 Level-2 via IRSA. Switch surveys with the Background survey selector on Explore Sky.</p>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Understanding candidate detection</h3><span className="sub">the Candidate Objects workflow</span></div>
              <dl className="kv-rows cmp-kv">
                <div className="kv-row"><dt>Residual candidate</dt><dd>A connected group of valid pixels whose brightness change stands out from the noise. A candidate is a location worth inspecting — not a discovery, variable star, transient, asteroid, moving object or Planet X.</dd></div>
                <div className="kv-row"><dt>Photutils</dt><dd>The established open-source segmentation library used here (detect_sources plus deblending), run separately on the positive and on the negated statistic map, with masked pixels excluded by construction.</dd></div>
                <div className="kv-row"><dt>Threshold in σ</dt><dd>Multiples of the local effective noise (propagated variance combined with background scatter). The allowed range is 3–10σ, default 5σ; raising it keeps only stronger residuals, so the count can only shrink.</dd></div>
                <div className="kv-row"><dt>Minimum area</dt><dd>How many connected valid pixels a segment needs (3–100, default 5). Single bright pixels, however extreme, do not pass.</dd></div>
                <div className="kv-row"><dt>Deblending</dt><dd>Splits nearby peaks that would otherwise merge into one segment, so close residuals are counted separately where the data support it.</dd></div>
                <div className="kv-row"><dt>Centroid and WCS</dt><dd>The brightness-weighted centre of each segment, converted to RA/Dec with the stored reference WCS. Segments touching the image border are removed, not reported.</dd></div>
                <div className="kv-row"><dt>Quality flags</dt><dd>Transparent caution notes — near_boundary, touches_masked, low_coverage, background_sensitive, psf_mismatch, possible_artefact — plus correlated_noise, which applies to every candidate because reprojection and convolution correlate pixels.</dd></div>
                <div className="kv-row"><dt>High statistic ≠ discovery</dt><dd>Extreme values (tens of σ) usually trace PSF-mismatch wings around bright sources. The statistic is diagnostic, never a calibrated probability, and one epoch pair cannot establish motion or variability.</dd></div>
              </dl>
              <p className="hint-line">Open it: <button className="text-button" onClick={() => setActiveNav("Candidate objects")}>Candidate objects <Icon name="arrow" size={14} /></button></p>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Limitations you should know</h3></div>
              <dl className="kv-rows cmp-kv">
                <div className="kv-row"><dt>IRSA availability</dt><dd>Archive queries and cutout downloads cross the network with a 60-second deadline; slow or failed requests report an error instead of hanging or inventing data.</dd></div>
                <div className="kv-row"><dt>ZODI model</dt><dd>Background correction inherits the model's error; the raw difference is kept so nothing is hidden.</dd></div>
                <div className="kv-row"><dt>PSF approximation</dt><dd>Gaussian matching at undersampled pixel scale; residual mismatch near bright sources dominates faint-residual searches.</dd></div>
                <div className="kv-row"><dt>Correlated noise</dt><dd>Reprojection and convolution correlate neighbouring pixels, so sigma levels overstate confidence; thresholds stay conservative and every candidate is flagged.</dd></div>
                <div className="kv-row"><dt>Single pair</dt><dd>Two epochs cannot establish motion; a residual's sign alone says nothing about what caused it.</dd></div>
                <div className="kv-row"><dt>Validation needed</dt><dd>Candidate residuals require independent follow-up before anyone calls them real.</dd></div>
              </dl>
            </div>

            <div className="info-card">
              <div className="card-head"><h3>Glossary and sources</h3></div>
              <p className="body">FITS — Flexible Image Transport System, the astronomy image format. HDU — header-data unit, one named section of a FITS file. WCS — world coordinate system, pixels to sky. PSF — point-spread function, how optics blur a point. MJD — modified Julian date, the time stamp on observations. SIA2 — the Virtual Observatory image-search protocol this app queries at IRSA (irsa.ipac.caltech.edu). DR1 — the first SPHEREx data release used throughout. Flag table — the official SPHEREx Data Explorer flag-bit table (Explanatory Supplement, Table 16) behind the masking policy.</p>
              <p className="hint-line">Data: NASA/IPAC IRSA SIA2 and Cutout services, SPHEREx DR1 Level-2 spectral images. Methods: documented in this app's validation records. SPHEREx Vision is an independent participant project developed for NASA Space Apps Challenge. It is not affiliated with, endorsed by, or an official product of NASA.</p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;