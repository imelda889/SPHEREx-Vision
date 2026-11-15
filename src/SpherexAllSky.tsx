import { useEffect, useRef, useState } from "react";
import { lonLat2PixNest, nest2fxy, order2nside } from "healpix-ts";

// Official SPHEREx HiPS cube wavelengths (µm), 102 values from data_cube_crval3_arr.
// Frame index = 17*(band-1)+(channel-1). Frames 50, 51 are blank (dichroic).
const SPHEREX_WAVELENGTHS: number[] = [
  0.753,0.771,0.790,0.809,0.828,0.848,0.868,0.889,0.910,0.932,0.955,0.978,1.001,1.025,1.050,1.075,1.102,
  1.113,1.139,1.167,1.195,1.224,1.254,1.284,1.315,1.346,1.378,1.412,1.446,1.481,1.517,1.554,1.592,1.631,1.656,1.695,1.735,1.775,1.818,1.861,1.905,1.949,1.995,2.041,2.089,2.139,2.189,2.240,2.292,2.345,
  2.399,2.445,
  2.506,2.575,2.646,2.719,2.794,2.871,2.951,3.033,3.118,3.204,3.293,3.383,3.476,3.570,3.667,3.768,3.833,3.867,3.901,3.935,3.970,4.005,4.040,4.076,4.112,4.148,4.184,4.220,4.257,4.294,4.331,4.368,4.405,4.435,4.467,4.500,4.533,4.566,4.600,4.635,4.669,4.704,4.739,4.773,4.808,4.843,4.879,4.915,4.951,4.988,
];
const BLANK_FRAMES = new Set([50, 51]);
const VALID_LAYERS = Array.from({ length: 102 }, (_, i) => i).filter((i) => !BLANK_FRAMES.has(i));
const HIPS_ROOT = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";

const NSIDE_ORDER0 = 1; // order 0
const NSIDE_ORDER9 = 512; // 2^9 = 512, for sub-pixel lookup
const ORDER9_PIXELS_PER_TILE = 512 * 512; // 262144
const POLAR_CAP_BOUNDARY_DEG = (Math.asin(2 / 3) * 180) / Math.PI;

function tileUrl(ipix: number, layer: number): string {
  const dir = Math.floor(ipix / 10000) * 10000;
  return `${HIPS_ROOT}/Norder0/Dir0/Npix${ipix}_${layer}.png`;
}

// Aitoff projection (PROJ convention)
function aitoffForward(ra: number, dec: number): { x: number; y: number } {
  const lambda = ((ra - 180) * Math.PI) / 180;
  const phi = (dec * Math.PI) / 180;
  const alpha = Math.acos(Math.max(-1, Math.min(1, Math.cos(phi) * Math.cos(lambda / 2))));
  if (alpha === 0) return { x: 0, y: 0 };
  const s = alpha / Math.sin(alpha);
  return { x: 2 * Math.cos(phi) * Math.sin(lambda / 2) * s, y: Math.sin(phi) * s };
}

function aitoffInverse(x: number, y: number): { ra: number; dec: number } | null {
  const alpha = Math.sqrt((x / 2) ** 2 + y ** 2);
  if (alpha === 0) return { ra: 180, dec: 0 };
  if (alpha > Math.PI / 2 + 0.01) return null; // outside Aitoff ellipse
  const phi = Math.asin(Math.max(-1, Math.min(1, (y * Math.sin(alpha)) / alpha)));
  const lambda = 2 * Math.atan2((x / 2) * Math.sin(alpha), alpha * Math.cos(alpha));
  const ra = (((lambda * 180) / Math.PI) + 180 + 360) % 360;
  const dec = (phi * 180) / Math.PI;
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || dec < -90 || dec > 90) return null;
  return { ra, dec };
}

export function SpherexAllSky({
  onCenter,
  onFov,
  onCursor,
  onSelect,
  onRect: _onRect,
  onDrag,
  obsList: _obsList,
  selectedObs: _selectedObs,
  selection,
  mode,
}: {
  onCenter: (c: { ra: number; dec: number }) => void;
  onFov: (f: number) => void;
  onCursor: (c: { ra: number; dec: number } | null) => void;
  onSelect: (ra: number, dec: number) => void;
  onRect: (ra: number, dec: number, r: number, ask: boolean) => void;
  onDrag?: (ra: number, dec: number, r: number) => void;
  obsList?: unknown[];
  selectedObs?: string | null;
  selection?: { ra: number; dec: number } | null;
  mode?: "pan" | "select";
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [allSkyMode, setAllSkyMode] = useState<"rgb" | "single">("single");
  const [shortLayer, setShortLayer] = useState(5);
  const [medLayer, setMedLayer] = useState(52);
  const [longLayer, setLongLayer] = useState(100);
  const [singleLayer, setSingleLayer] = useState(52);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading SPHEREx tiles…");
  const [zoom, setZoom] = useState(1);

  // View transform
  const viewRef = useRef({ panX: 0, panY: 0 });
  const dragRef = useRef<{ x0: number; y0: number; moved: boolean } | null>(null);
  // Cached tile ImageData: key = "{ipix}_{layer}", value = ImageData (512×512)
  const tilesDataRef = useRef<Map<string, ImageData>>(new Map());
  // Cached base image (full-sky render at current zoom/wavelengths/dimensions)
  const baseImageRef = useRef<ImageData | null>(null);
  const baseParamsRef = useRef<string>("");
  const availableTilesRef = useRef<number | null>(null);
  const genRef = useRef<number>(0);
  const pendingCursorRef = useRef<{ ra: number; dec: number } | null>(null);
  const cursorFrameRef = useRef(0);

  const fetchTileData = async (ipix: number, layer: number): Promise<ImageData | null> => {
    if (BLANK_FRAMES.has(layer)) return null;
    const key = `${ipix}_${layer}`;
    const cached = tilesDataRef.current.get(key);
    if (cached) return cached;
    try {
      const url = tileUrl(ipix, layer);
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      // Decode to ImageData
      const offscreen = new OffscreenCanvas(512, 512);
      const octx = offscreen.getContext("2d");
      if (!octx) return null;
      octx.drawImage(bmp, 0, 0);
      const data = octx.getImageData(0, 0, 512, 512);
      bmp.close();
      tilesDataRef.current.set(key, data);
      return data;
    } catch {
      return null;
    }
  };

  const render = async () => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 10 || h < 10) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const gen = ++genRef.current;
    setLoading(true);
    setError("");

    const layers = allSkyMode === "rgb" ? [shortLayer, medLayer, longLayer] : [singleLayer];
    const uniqueLayers = [...new Set(layers)];

    // Check if base image needs recomputation
    const paramsKey = `${w}_${h}_${zoom}_${allSkyMode}_${shortLayer}_${medLayer}_${longLayer}_${singleLayer}`;
    const needsRecompute = baseParamsRef.current !== paramsKey || !baseImageRef.current;

    if (needsRecompute) {
      // Fetch all tiles for all required layers
      setStatus("Loading SPHEREx tiles…");
      const tilePromises = Array.from({ length: 12 }, (_, ipix) =>
        Promise.all(uniqueLayers.map((l) => fetchTileData(ipix, l))).then((bitmaps) => ({ ipix, bitmaps }))
      );
      const results = await Promise.all(tilePromises);
      if (gen !== genRef.current) return; // stale
      availableTilesRef.current = results.filter(({ bitmaps }) =>
        uniqueLayers.every((_, index) => Boolean(bitmaps[index])),
      ).length;

      // Build base image via inverse mapping
      setStatus("Rendering all-sky map…");
      const baseImage = ctx.createImageData(w, h);
      const baseData = baseImage.data;

      // Pre-extract tile pixel arrays (null = missing)
      const tileArrays: (Uint8ClampedArray | null)[][] = results.map(({ bitmaps }) =>
        bitmaps.map((b) => (b ? b.data : null))
      );

      const scale = Math.min(w / (2 * Math.PI), h / Math.PI) * zoom;
      const nside = NSIDE_ORDER9;

      for (let cy = 0; cy < h; cy++) {
        if (gen !== genRef.current) return; // stale
        for (let cx = 0; cx < w; cx++) {
          // Normalized Aitoff coords
          const x = (cx - w / 2) / scale;
          const y = (h / 2 - cy) / scale;

          // Check within Aitoff ellipse
          const alpha = Math.sqrt((x / 2) ** 2 + y ** 2);
          if (alpha > Math.PI / 2 + 0.001) continue; // outside, leave black

          // Aitoff inverse
          const inv = aitoffInverse(x, y);
          if (!inv) continue;
          const { ra, dec } = inv;

          // Convert ra to [-180, 180] for healpix-ts.
          let lon = ra > 180 ? ra - 360 : ra;
          // Bias only exact north-polar 0/180 meridians to match Astropy's edge convention.
          if (dec >= POLAR_CAP_BOUNDARY_DEG && (lon === 0 || lon === 180)) {
            lon += 1e-9;
          }
          const lat = dec;

          // HEALPix lookup (order 9, nside=512)
          let ipix9: number;
          try {
            ipix9 = lonLat2PixNest(nside, lon, lat);
          } catch {
            continue;
          }
          const ipix0 = Math.floor(ipix9 / ORDER9_PIXELS_PER_TILE);

          // Sub-pixel within tile
          const k = ipix9 % ORDER9_PIXELS_PER_TILE;
          // bit decombine: extract even bits -> x, odd bits -> y
          let sx = 0, sy = 0;
          for (let b = 0; b < 9; b++) {
            sx |= ((k >> (2 * b)) & 1) << b;
            sy |= ((k >> (2 * b + 1)) & 1) << b;
          }

          const tileIdx = ipix0;
          if (tileIdx < 0 || tileIdx > 11) continue;

          const tileLayers = tileArrays[tileIdx];
          if (!tileLayers) continue;

          // Sample pixel from each layer
          // HiPS PNG rows use the nested x coordinate and columns use y.
          const srcIdx = (sx * 512 + sy) * 4;

          if (allSkyMode === "rgb") {
            const shortData = tileLayers[uniqueLayers.indexOf(shortLayer)];
            const medData = tileLayers[uniqueLayers.indexOf(medLayer)];
            const longData = tileLayers[uniqueLayers.indexOf(longLayer)];
            if (!shortData || !medData || !longData) continue;
            // Missing data: palette index 0 (transparent) or index 1 (opaque black, value 0)
            const shortVal = shortData[srcIdx];
            const medVal = medData[srcIdx];
            const longVal = longData[srcIdx];
            // Check if any layer has missing data (value 0 with no valid signal)
            // Since real dark sky is ~35+, value 0 means missing
            if (shortVal === 0 || medVal === 0 || longVal === 0) continue; // skip missing
            const dstIdx = (cy * w + cx) * 4;
            baseData[dstIdx] = longVal;     // R = long
            baseData[dstIdx + 1] = medVal;  // G = medium
            baseData[dstIdx + 2] = shortVal; // B = short
            baseData[dstIdx + 3] = 255;
          } else {
            const singleData = tileLayers[uniqueLayers.indexOf(singleLayer)];
            if (!singleData) continue;
            const singleVal = singleData[srcIdx];
            if (singleVal === 0) continue; // skip missing
            const dstIdx = (cy * w + cx) * 4;
            baseData[dstIdx] = singleVal;
            baseData[dstIdx + 1] = singleVal;
            baseData[dstIdx + 2] = singleVal;
            baseData[dstIdx + 3] = 255;
          }
        }
      }

      if (gen !== genRef.current) return; // stale
      baseImageRef.current = baseImage;
      baseParamsRef.current = paramsKey;
    }

    // Blit base image to canvas with pan offset.
    // Use drawImage (respects transform) instead of putImageData (ignores transform)
    // to correctly handle high-DPI displays.
    if (baseImageRef.current) {
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = w;
      tmpCanvas.height = h;
      const tmpCtx = tmpCanvas.getContext("2d");
      if (tmpCtx) {
        tmpCtx.putImageData(baseImageRef.current, 0, 0);
        ctx.drawImage(tmpCanvas, viewRef.current.panX, viewRef.current.panY);
      }
    }

    const availableTiles = availableTilesRef.current ?? 0;
    // Draw grid overlay
    ctx.strokeStyle = "rgba(101,200,232,0.12)";
    ctx.lineWidth = 0.5;
    // RA lines
    for (let ra = 0; ra < 360; ra += 30) {
      ctx.beginPath();
      let first = true;
      for (let dec = -90; dec <= 90; dec += 2) {
        const { x, y } = aitoffForward(ra, dec);
        const scale = Math.min(w / (2 * Math.PI), h / Math.PI) * zoom;
        const sx = w / 2 + x * scale + viewRef.current.panX;
        const sy = h / 2 - y * scale + viewRef.current.panY;
        if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    // Dec lines
    for (let dec = -90; dec <= 90; dec += 30) {
      ctx.beginPath();
      let first = true;
      for (let ra = 0; ra <= 360; ra += 2) {
        const { x, y } = aitoffForward(ra, dec);
        const scale = Math.min(w / (2 * Math.PI), h / Math.PI) * zoom;
        const sx = w / 2 + x * scale + viewRef.current.panX;
        const sy = h / 2 - y * scale + viewRef.current.panY;
        if (first) { ctx.moveTo(sx, sy); first = false; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    if (gen !== genRef.current) return;
    setLoading(false);
    if (availableTiles < 12) {
      setError(
        availableTiles === 0
          ? "Official SPHEREx HiPS tiles are unavailable. Try again later; no substitute data is shown."
          : `Only ${availableTiles} of 12 official SPHEREx HiPS tiles loaded. The view is incomplete; no substitute data is shown.`,
      );
    }
    setStatus(
      allSkyMode === "rgb"
        ? `SPHEREx DR1 All-Sky — False-Colour RGB (B=${SPHEREX_WAVELENGTHS[shortLayer].toFixed(3)} G=${SPHEREX_WAVELENGTHS[medLayer].toFixed(3)} R=${SPHEREX_WAVELENGTHS[longLayer].toFixed(3)} µm) — ${availableTiles}/12 HiPS tiles`
        : `SPHEREx DR1 All-Sky — Single Band ${SPHEREX_WAVELENGTHS[singleLayer].toFixed(3)} µm — ${availableTiles}/12 HiPS tiles`
    );
    onCenter({ ra: 180, dec: 0 });
    onFov(180);
  };

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSkyMode, shortLayer, medLayer, longLayer, singleLayer, zoom]);

  useEffect(() => () => {
    if (cursorFrameRef.current) cancelAnimationFrame(cursorFrameRef.current);
  }, []);

  const selectionPosition = (() => {
    if (!selection || !Number.isFinite(selection.ra) || !Number.isFinite(selection.dec)) return null;
    const container = containerRef.current;
    if (!container) return null;
    const { clientWidth: w, clientHeight: h } = container;
    if (w < 10 || h < 10) return null;
    const { x, y } = aitoffForward(selection.ra, selection.dec);
    const scale = Math.min(w / (2 * Math.PI), h / Math.PI) * zoom;
    return {
      left: w / 2 + x * scale + viewRef.current.panX,
      top: h / 2 - y * scale + viewRef.current.panY,
    };
  })();

  const handlePointerDown = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, moved: false };
  };

  const queueCursor = (cursor: { ra: number; dec: number } | null) => {
    pendingCursorRef.current = cursor;
    if (cursorFrameRef.current) return;
    cursorFrameRef.current = requestAnimationFrame(() => {
      cursorFrameRef.current = 0;
      onCursor(pendingCursorRef.current);
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;
    if (d && Math.hypot(x1 - d.x0, y1 - d.y0) > 6) d.moved = true;
    if (d?.moved && mode === "pan") {
      viewRef.current.panX += x1 - d.x0;
      viewRef.current.panY += y1 - d.y0;
      d.x0 = x1;
      d.y0 = y1;
      // Just blit cached base image with new pan (no re-render)
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && baseImageRef.current) {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#04070f";
        ctx.fillRect(0, 0, w, h);
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = w;
        tmpCanvas.height = h;
        const tmpCtx = tmpCanvas.getContext("2d");
        if (tmpCtx) {
          tmpCtx.putImageData(baseImageRef.current, 0, 0);
          ctx.drawImage(tmpCanvas, viewRef.current.panX, viewRef.current.panY);
        }
      }
    }
    // Cursor
    const w = rect.width;
    const h = rect.height;
    const baseScale = Math.min(w / (2 * Math.PI), h / Math.PI) * zoom;
    const x = (e.clientX - rect.left - w / 2 - viewRef.current.panX) / baseScale;
    const y = -(e.clientY - rect.top - h / 2 - viewRef.current.panY) / baseScale;
    const inv = aitoffInverse(x, y);
    queueCursor(inv);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved || mode === "pan") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const baseScale = Math.min(rect.width / (2 * Math.PI), rect.height / Math.PI) * zoom;
    const x = (e.clientX - rect.left - rect.width / 2 - viewRef.current.panX) / baseScale;
    const y = -(e.clientY - rect.top - rect.height / 2 - viewRef.current.panY) / baseScale;
    const inv = aitoffInverse(x, y);
    if (inv) onSelect(inv.ra, inv.dec);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.3, Math.min(8, z * (e.deltaY < 0 ? 1.15 : 0.87))));
  };

  const handlePointerLeave = () => {
    dragRef.current = null;
    if (cursorFrameRef.current) cancelAnimationFrame(cursorFrameRef.current);
    cursorFrameRef.current = 0;
    pendingCursorRef.current = null;
    onCursor(null);
  };

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#04070f", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: mode === "select" ? "crosshair" : "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
      {selectionPosition && (
        <div
          role="img"
          aria-label={`Selected sky center RA ${selection?.ra.toFixed(5)} degrees, Dec ${selection?.dec.toFixed(5)} degrees`}
          title="Selected sky center"
          style={{
            position: "absolute",
            left: selectionPosition.left,
            top: selectionPosition.top,
            width: 16,
            height: 16,
            border: "2px solid #65c8e8",
            borderRadius: "50%",
            background: "rgba(4,7,15,0.2)",
            boxShadow: "0 0 8px rgba(101,200,232,0.8)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
      {loading && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: "rgba(4,8,15,0.92)", border: "1px solid #26374b", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f1f5f9", zIndex: 2 }}>
          <span className="spinner" style={{ marginRight: 8 }} /> {status}
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: "rgba(4,8,15,0.92)", border: "1px solid #e07a6a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f1f5f9", zIndex: 2, textAlign: "center", maxWidth: 400 }}>
          {error}
          <button className="text-button" style={{ display: "block", marginTop: 8, marginLeft: "auto", marginRight: "auto" }} onClick={() => render()}>
            Retry
          </button>
        </div>
      )}
      {/* Controls overlay */}
      <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 6, flexWrap: "wrap", zIndex: 3, maxWidth: "90%" }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 6, padding: 3 }}>
          <button className={`tool-button${allSkyMode === "rgb" ? " active" : ""}`} style={{ height: 28, fontSize: 10, padding: "0 8px" }} onClick={() => setAllSkyMode("rgb")}>RGB Composite</button>
          <button className={`tool-button${allSkyMode === "single" ? " active" : ""}`} style={{ height: 28, fontSize: 10, padding: "0 8px" }} onClick={() => setAllSkyMode("single")}>Single Band</button>
        </div>
        {allSkyMode === "rgb" ? (
          <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 6, padding: "3px 6px", fontSize: 10, color: "#91a2b8" }}>
            <span>B:</span>
            <select value={shortLayer} onChange={(e) => setShortLayer(Number(e.target.value))} style={{ height: 22, fontSize: 9, background: "#080e18", color: "#f1f5f9", border: "1px solid #26374b", borderRadius: 3 }}>
              {VALID_LAYERS.map((i) => (<option key={i} value={i}>{i} ({SPHEREX_WAVELENGTHS[i].toFixed(3)} µm)</option>))}
            </select>
            <span>G:</span>
            <select value={medLayer} onChange={(e) => setMedLayer(Number(e.target.value))} style={{ height: 22, fontSize: 9, background: "#080e18", color: "#f1f5f9", border: "1px solid #26374b", borderRadius: 3 }}>
              {VALID_LAYERS.map((i) => (<option key={i} value={i}>{i} ({SPHEREX_WAVELENGTHS[i].toFixed(3)} µm)</option>))}
            </select>
            <span>R:</span>
            <select value={longLayer} onChange={(e) => setLongLayer(Number(e.target.value))} style={{ height: 22, fontSize: 9, background: "#080e18", color: "#f1f5f9", border: "1px solid #26374b", borderRadius: 3 }}>
              {VALID_LAYERS.map((i) => (<option key={i} value={i}>{i} ({SPHEREX_WAVELENGTHS[i].toFixed(3)} µm)</option>))}
            </select>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center", background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 6, padding: "3px 6px", fontSize: 10, color: "#91a2b8" }}>
            <span>Band:</span>
            <select value={singleLayer} onChange={(e) => setSingleLayer(Number(e.target.value))} style={{ height: 22, fontSize: 9, background: "#080e18", color: "#f1f5f9", border: "1px solid #26374b", borderRadius: 3 }}>
              {VALID_LAYERS.map((i) => (<option key={i} value={i}>{i} ({SPHEREX_WAVELENGTHS[i].toFixed(3)} µm)</option>))}
            </select>
          </div>
        )}
      </div>
      {/* Legend */}
      <div style={{ position: "absolute", bottom: 42, left: 10, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "4px 10px", fontSize: 9, color: "#8a93a6", zIndex: 3 }}>
        {allSkyMode === "rgb" ? (
          <>False-Colour Spectral Composite — B={SPHEREX_WAVELENGTHS[shortLayer].toFixed(3)} G={SPHEREX_WAVELENGTHS[medLayer].toFixed(3)} R={SPHEREX_WAVELENGTHS[longLayer].toFixed(3)} µm. Not natural colour. Official SPHEREx DR1 HiPS.</>
        ) : (
          <>Single Wavelength {SPHEREX_WAVELENGTHS[singleLayer].toFixed(3)} µm — Official SPHEREx DR1 HiPS (inverse reprojection)</>
        )}
        <span style={{ display: "block", fontSize: 8, opacity: 0.7 }}>Visualization only: raster registration, layer numbering, and HEALPix edge/pole behavior are not fully verified. Use Coverage Map or IRSA for precise feature positions.</span>
      </div>
      {/* Status */}
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "3px 10px", fontSize: 9, color: "#65c8e8", zIndex: 3, whiteSpace: "nowrap" }}>
        {status}
      </div>
      {/* Zoom controls (bottom-right) */}
      <div style={{ position: "absolute", bottom: 42, right: 10, display: "flex", gap: 4, zIndex: 3 }}>
        <button className="icon-button" style={{ width: 32, height: 32 }} onClick={() => setZoom((z) => Math.min(8, z * 1.3))} aria-label="Zoom in" title="Zoom in">+</button>
        <button className="icon-button" style={{ width: 32, height: 32 }} onClick={() => setZoom((z) => Math.max(0.3, z / 1.3))} aria-label="Zoom out" title="Zoom out">−</button>
        <button className="icon-button" style={{ width: 32, height: 32, fontSize: 9 }} onClick={() => { setZoom(1); viewRef.current.panX = 0; viewRef.current.panY = 0; render(); }} aria-label="Reset zoom" title="Reset zoom">1×</button>
      </div>
      {/* IRSA link */}
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
        <a href={`https://irsa.ipac.caltech.edu/irsaviewer?api=hips&uri=${encodeURIComponent(HIPS_ROOT)}&ra=180&dec=0&sr=180d`} target="_blank" rel="noopener noreferrer" className="text-button" style={{ fontSize: 9, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "4px 10px" }}>
          Open Official SPHEREx Cube in IRSA Viewer ↗
        </a>
      </div>
    </div>
  );
}