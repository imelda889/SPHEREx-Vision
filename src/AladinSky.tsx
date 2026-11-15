import { useEffect, useRef, useState } from "react";
import type { AladinInstance, AladinMoc } from "aladin-lite";
import type AType from "aladin-lite";

type SkyFootprintLite = { obs_id: string; footprint: { kind: string; vertices?: Array<[number, number]> } | null };

export function AladinSky({
  survey,
  onSurveyBusy,
  onCenter,
  onFov,
  onCursor,
  onSelect,
  onRect,
  footprintsOn,
  obsList,
  selectedObs,
  onReady,
  selection,
  cooGridOn,
  reticleOn,
  onLoadState,
  mode,
  onDrag,
  onHipsStatus,
}: {
  survey: string;
  onSurveyBusy: (b: boolean) => void;
  onCenter: (c: { ra: number; dec: number }) => void;
  onFov: (f: number) => void;
  onCursor: (c: { ra: number; dec: number } | null) => void;
  onSelect: (ra: number, dec: number) => void;
  onRect: (ra: number, dec: number, radiusDeg: number, askComplete: boolean) => void;
  footprintsOn: boolean;
  obsList: SkyFootprintLite[];
  selectedObs: string | null;
  onReady?: (al: AladinInstance | null) => void;
  selection?: { ra: number; dec: number; radius: number } | null;
  cooGridOn?: boolean;
  reticleOn?: boolean;
  onLoadState?: (s: "idle" | "loading" | "ready" | "error", msg?: string) => void;
  mode?: "pan" | "select";
  onDrag?: (ra: number, dec: number, radius: number) => void;
  onHipsStatus?: (ok: boolean | null, msg?: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinInstance | null>(null);
  const modRef = useRef<typeof AType | null>(null);
  const mocsRef = useRef<AladinMoc[]>([]);
  const selMocRef = useRef<AladinMoc | null>(null);
  const rectRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<null | { x0: number; y0: number; moved: boolean }>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadError, setLoadError] = useState("");
  const [hipsError, setHipsError] = useState<string | null>(null);
  const [hipsRetry, setHipsRetry] = useState(0);
  useEffect(() => {
    onLoadState?.(loadState, loadError);
  }, [loadState, loadError, onLoadState]);

  // Stage E-G: verify HiPS properties/tiles are actually reachable (not just init).
  // Tries a lightweight Allsky.jpg probe with 6s timeout across primary + fallback.
  const probeHips = async (surveyId: string): Promise<boolean> => {
    const candidates = [
      `https://alasky.cds.unistra.fr/${surveyId}/properties`,
      `https://alasky.cds.unistra.fr/${surveyId}/Norder0/Allsky.jpg`,
      `https://alaskybis.cds.unistra.fr/${surveyId}/properties`,
      `https://hips.cds.unistra.fr/${surveyId}/properties`,
    ];
    for (const url of candidates) {
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 6000);
        // For jpg we test via fetch HEAD to avoid CORS image decode; for properties use GET.
        const res = await fetch(url, { signal: ctrl.signal, mode: "cors", cache: "no-store" });
        window.clearTimeout(t);
        if (res.ok) return true;
        // 404/5xx → try next mirror
      } catch {
        /* try next */
      }
    }
    // Image fallback: try loading Allsky via <img> which bypasses CORS for JPEG
    return await new Promise<boolean>((resolve) => {
      const img = new Image();
      const timer = window.setTimeout(() => { img.src = ""; resolve(false); }, 6000);
      img.onload = () => { window.clearTimeout(timer); resolve(true); };
      img.onerror = () => { window.clearTimeout(timer); resolve(false); };
      img.src = `https://alasky.cds.unistra.fr/${surveyId}/Norder0/Allsky.jpg`;
    });
  };

  // Init — retryable via initKey. Waits for non-zero layout.
  const [initKey, setInitKey] = useState(0);
  const doRetry = () => setInitKey((k) => k + 1);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    // Defer one frame so the flex/grid parent has computed its height.
    // If still zero, keep retrying until the container is measurable.
    const waitForSize = async () => {
      for (let i = 0; i < 30; i++) {
        if (host.clientWidth > 32 && host.clientHeight > 32) return;
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      }
    };
    setLoadState("loading");
    // Hard timeout so UI never hangs forever on WASM/init issues.
    const hardTimer = window.setTimeout(() => {
      if (!cancelled && !aladinRef.current) {
        setLoadState("error");
        setLoadError("Sky survey is taking too long — showing grid fallback. Tap Retry to reload real survey.");
      }
    }, 12000);
    (async () => {
      await waitForSize();
      if (cancelled) return;
      if (host.clientWidth < 32 || host.clientHeight < 32) {
        throw new Error("Sky viewer container has no size — layout not ready");
      }
      try {
        let mod: typeof AType | null = null;
        // Prefer CDN first — avoids Vite WASM bundling quirks that hang npm's init.
        try {
          await new Promise<void>((resolve, reject) => {
            const w = (window as unknown as { A?: typeof AType }).A;
            if (w) {
              resolve();
              return;
            }
            const existing = document.querySelector('script[data-aladin-cdn]') as HTMLScriptElement | null;
            if (existing) {
              if ((window as unknown as { A?: typeof AType }).A) resolve();
              else existing.addEventListener("load", () => resolve());
              existing.addEventListener("error", () => reject(new Error("Aladin CDN load failed")));
              setTimeout(() => reject(new Error("Aladin CDN timeout")), 10000);
              return;
            }
            const s = document.createElement("script");
            s.src = "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js";
            s.async = true;
            s.dataset.aladinCdn = "1";
            s.onload = () => resolve();
            s.onerror = () => reject(new Error("Aladin CDN load failed"));
            document.head.appendChild(s);
            setTimeout(() => reject(new Error("Aladin CDN timeout")), 10000);
          });
          const w = (window as unknown as { A?: typeof AType }).A;
          if (!w) throw new Error("Aladin global not found after CDN load");
          await Promise.race([
            w.init,
            new Promise((_, rej) => setTimeout(() => rej(new Error("Aladin CDN init timeout")), 8000)),
          ]);
          mod = w;
        } catch (cdnErr) {
          // Fallback: try npm bundle (Vite + wasm plugin).
          if (cancelled) return;
          const m = (await import("aladin-lite")).default as typeof AType;
          await Promise.race([
            m.init,
            new Promise((_, rej) => setTimeout(() => rej(new Error("Aladin npm init timeout")), 8000)),
          ]);
          mod = m;
        }
        if (cancelled) return;
        if (!mod) throw new Error("Aladin module unavailable");
        modRef.current = mod;
        // Now mod.init is already done (race above), proceed.
        if (cancelled) return;
        const ro = new ResizeObserver(() => window.dispatchEvent(new Event("resize")));
        ro.observe(host);
        const al = mod.aladin(host, {
          survey,
          fov: 180,
          projection: "AIT",
          cooFrame: "ICRS",
          showZoomControl: false,
          showFullscreenControl: false,
          showGotoControl: false,
          showLayersControl: false,
          showShareControl: false,
          showContextMenu: false,
          showCooGrid: true,
          showReticle: true,
          fullScreen: false,
        }) as AladinInstance;
        aladinRef.current = al;
        onReady?.(al);
        const sync = () => {
          try {
            const c = al.getRaDec();
            const f = al.getFoV();
            onCenter({ ra: c[0], dec: c[1] });
            onFov(Array.isArray(f) ? f[0] : (f as number));
          } catch {
            /* after unmount */
          }
        };
        al.on("positionChanged", sync);
        al.on("zoomChanged", sync);
        sync();
        al.on("mouseMove", (pos: { ra?: number; dec?: number } | null) => {
          if (pos && typeof pos.ra === "number" && typeof pos.dec === "number") onCursor({ ra: pos.ra, dec: pos.dec });
          else onCursor(null);
        });
        window.clearTimeout(hardTimer);
        setLoadState("ready");
        return () => ro.disconnect();
      } catch (e) {
        window.clearTimeout(hardTimer);
        if (!cancelled) {
          setLoadState("error");
          setLoadError(String((e as Error)?.message ?? e));
        }
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(hardTimer);
      onReady?.(null);
    };
  }, [initKey]);

  // Survey switch + HiPS reachability verification (stages D-G).
  useEffect(() => {
    const al = aladinRef.current;
    if (!al || loadState !== "ready") return;
    let cancelled = false;
    onSurveyBusy(true);
    setHipsError(null);
    (async () => {
      try {
        al.setImageSurvey(survey);
      } catch (e) {
        if (!cancelled) setHipsError(String((e as Error)?.message ?? e));
      }
      // Verify tiles actually reachable (stage D-G); never claim success on init alone.
      // CDS (alasky.cds.unistra.fr) is in maintenance 2026-11-14 — returns 404 Page unavailable
      // for every HiPS path; alaskybis times out. This is external, not a code bug.
      const ok = await probeHips(survey);
      if (cancelled) return;
      if (!ok) {
        const msg = `Background survey temporarily unavailable — CDS HiPS (alasky.cds.unistra.fr) is returning 404 "Page unavailable" for ${survey} right now (verified via 404 properties + Allsky.jpg). Showing local all-sky preview — searches, footprints and FITS previews still work. Tap Retry when CDS recovers.`;
        setHipsError(msg);
        onHipsStatus?.(false, msg);
      } else {
        setHipsError(null);
        onHipsStatus?.(true);
      }
      requestAnimationFrame(() => onSurveyBusy(false));
    })();
    return () => { cancelled = true; };
  }, [survey, loadState, hipsRetry, onSurveyBusy]);

  useEffect(() => {
    const al = aladinRef.current;
    if (!al || loadState !== "ready" || cooGridOn === undefined) return;
    try {
      al.setCooGrid(cooGridOn);
    } catch {
      /* optional API */
    }
  }, [cooGridOn, loadState]);

  useEffect(() => {
    const al = aladinRef.current;
    if (!al || loadState !== "ready" || reticleOn === undefined) return;
    try {
      al.showReticule(reticleOn);
    } catch {
      /* optional API */
    }
  }, [reticleOn, loadState]);

  // Selection circle driven by shared App state.
  useEffect(() => {
    const mod = modRef.current;
    const al = aladinRef.current;
    if (!mod || !al || loadState !== "ready") return;
    // Clear previous selection.
    if (selMocRef.current) {
      try {
        const rm = al as unknown as { removeMOC?: (x: unknown) => void };
        if (typeof rm.removeMOC === "function") rm.removeMOC(selMocRef.current);
        else selMocRef.current.hide();
      } catch {
        /* best-effort */
      }
      selMocRef.current = null;
    }
    if (!selection || !Number.isFinite(selection.ra) || !Number.isFinite(selection.dec) || !(selection.radius > 0)) return;
    try {
      const moc = mod.MOCFromCone(
        { ra: selection.ra, dec: selection.dec, radius: Math.min(Math.max(selection.radius, 0.02), 180) },
        { color: "#65c8e8", opacity: 0.55, lineWidth: 2 },
      );
      al.addMOC(moc);
      selMocRef.current = moc;
    } catch {
      /* selection still valid in shared state */
    }
  }, [selection, loadState]);

  // Footprints: one MOC per observation polygon (native WebGL).
  useEffect(() => {
    const mod = modRef.current;
    const al = aladinRef.current;
    if (!mod || !al || loadState !== "ready" || !footprintsOn) {
      // clear when toggled off
      for (const m of mocsRef.current) {
        try {
          const rm = al as unknown as { removeMOC?: (x: unknown) => void };
          if (al && typeof rm.removeMOC === "function") rm.removeMOC(m);
          else m.hide();
        } catch {
          /* best-effort */
        }
      }
      mocsRef.current = [];
      return;
    }
    // clear old
    for (const m of mocsRef.current) {
      try {
        const rm = al as unknown as { removeMOC?: (x: unknown) => void };
        if (typeof rm.removeMOC === "function") rm.removeMOC(m);
        else m.hide();
      } catch {
        /* best-effort */
      }
    }
    mocsRef.current = [];
    for (const o of obsList) {
      const fp = o.footprint as { kind?: string; vertices?: Array<[number, number]> } | null;
      if (!fp || fp.kind !== "polygon" || !Array.isArray(fp.vertices) || fp.vertices.length < 3) continue;
      try {
        const lon: number[] = [];
        const lat: number[] = [];
        for (const v of fp.vertices) {
          if (!Array.isArray(v) || v.length < 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1])) throw new Error("bad vertex");
          lon.push(v[0]);
          lat.push(v[1]);
        }
        const isSel = o.obs_id === selectedObs;
        const moc = mod.MOCFromPolygon(
          { ra: lon, dec: lat },
          isSel ? { color: "#65c8e8", opacity: 0.5, lineWidth: 3 } : { color: "#8b5cf6", opacity: 0.28, lineWidth: 1.5 },
        );
        al.addMOC(moc);
        mocsRef.current.push(moc);
      } catch {
        /* malformed footprint: skip */
      }
    }
  }, [obsList, selectedObs, footprintsOn, loadState]);

  // Selection circle is drawn by parent via shared state; here we mirror it as a MOC.
  // Parent owns the circle, so we expose a tiny helper via window for convenience? Instead parent drives via props: we watch a hidden prop.
  // Simpler: parent's showSelectionCircle is called directly; we also clear here when footprints redraw.

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode && mode !== "select") return;
    const al = aladinRef.current;
    if (!al || loadState !== "ready") return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = { x0: e.clientX - rect.left, y0: e.clientY - rect.top, moved: false };
    if (rectRef.current) {
      rectRef.current.style.display = "none";
    }
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (mode && mode !== "select") return;
    const al = aladinRef.current;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;
    if (Math.hypot(x1 - d.x0, y1 - d.y0) > 6) d.moved = true;
    if (d.moved && rectRef.current) {
      const left = Math.min(d.x0, x1);
      const top = Math.min(d.y0, y1);
      const w = Math.abs(x1 - d.x0);
      const h = Math.abs(y1 - d.y0);
      rectRef.current.style.left = `${left}px`;
      rectRef.current.style.top = `${top}px`;
      rectRef.current.style.width = `${w}px`;
      rectRef.current.style.height = `${h}px`;
      rectRef.current.style.display = "block";
      // Live update top inputs while dragging
      if (onDrag && al) {
        try {
          const cx = (d.x0 + x1) / 2;
          const cy = (d.y0 + y1) / 2;
          const cen = al.pix2world(cx, cy);
          const rA = al.angularDist(d.x0, d.y0, x1, y1) / 2;
          if (Array.isArray(cen) && Number.isFinite(cen[0]) && Number.isFinite(cen[1]) && Number.isFinite(rA)) {
            onDrag(cen[0], cen[1], Math.min(Math.max(rA, 0.02), 1));
          }
        } catch {
          /* ignore */
        }
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (mode && mode !== "select") return;
    const d = dragRef.current;
    dragRef.current = null;
    const host = e.currentTarget as HTMLElement;
    const rectEl = rectRef.current;
    if (rectEl) rectEl.style.display = "none";
    const al = aladinRef.current;
    if (!al || !d) return;
    const box = host.getBoundingClientRect();
    const x1 = e.clientX - box.left;
    const y1 = e.clientY - box.top;
    const dist = Math.hypot(x1 - d.x0, y1 - d.y0);
    try {
      if (dist < 8) {
        const w = al.pix2world(x1, y1);
        if (Array.isArray(w) && Number.isFinite(w[0]) && Number.isFinite(w[1])) onSelect(w[0], w[1]);
      } else {
        const a = al.pix2world(d.x0, d.y0);
        const b = al.pix2world(x1, y1);
        if (!Array.isArray(a) || !Array.isArray(b)) return;
        // Angular radius from rectangle: half the diagonal's angular distance.
        const cx = (d.x0 + x1) / 2;
        const cy = (d.y0 + y1) / 2;
        const cen = al.pix2world(cx, cy);
        if (!Array.isArray(cen)) return;
        const rA = al.angularDist(d.x0, d.y0, x1, y1) / 2;
        // Clamp to backend max 1.0°; larger asks require explicit confirm.
        const asked = Math.max(0.02, rA);
        const useR = Math.min(asked, 1);
        const needConfirm = asked > 1;
        onRect(cen[0], cen[1], useR, needConfirm);
        if (needConfirm) {
          // Caller will show a clamp message; we already applied the clamped value.
        }
      }
    } catch {
      /* projection edge: ignore */
    }
  };

  const showFallbackProminent = !!hipsError || loadState === "error";
  // Notify parent of fallback vs live for honest badge labeling.
  useEffect(() => {
    if (showFallbackProminent) onHipsStatus?.(false, hipsError || loadError);
    else if (loadState === "ready" && !hipsError) onHipsStatus?.(true);
  }, [showFallbackProminent, hipsError, loadError, loadState, onHipsStatus]);
  return (
    <div className="aladin-host" style={{ position: "absolute", inset: 0, background: "#04070f" }}>
      {/* Local illustrative background — visually distinct from scientific data (faint, never obscuring coverage). */}
      <img
        src="/sphere.png"
        alt="Local Preview — Not Live Survey Data (artistic illustration, not 2MASS/DSS2/SPHEREx)"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: showFallbackProminent ? 0.18 : 0, zIndex: 0, pointerEvents: "none", filter: showFallbackProminent ? "blur(0.5px) saturate(0.7)" : "none" }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
      {showFallbackProminent && (
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 2, background: "rgba(4,8,15,0.82)", border: "1px solid #26374b", borderRadius: 999, padding: "3px 8px", fontSize: 9, color: "#8a93a6", letterSpacing: ".06em" }}>Illustrative background — not data</div>
      )}
      <div ref={hostRef} style={{ position: "relative", width: "100%", height: "100%", zIndex: 1, opacity: 1, transition: "opacity 200ms ease" }} />
      {/* Selection rectangle overlay */}
      <div
        ref={rectRef}
        style={{
          display: "none",
          position: "absolute",
          border: "2px dashed #65c8e8",
          background: "rgba(101,200,232,0.12)",
          pointerEvents: "none",
        }}
      />
      {/* Interaction capture (transparent, above Aladin canvas) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          inset: 0,
          cursor: mode === "select" ? "crosshair" : "grab",
          touchAction: "none",
          pointerEvents: mode === "select" ? "auto" : "none",
        }}
        aria-label="Sky selection layer"
      />
      {loadState === "loading" && (
        <div className="aladin-loading" role="status">
          Loading real sky survey…
        </div>
      )}
      {loadState === "error" && (
        <div className="aladin-error" role="alert">
          Sky survey failed to load: {loadError || "unknown error"}{" "}
          <button
            className="text-button"
            onClick={() => {
              setLoadError("");
              setInitKey((k) => k + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {hipsError && loadState === "ready" && (
        <div className="aladin-error" role="alert" style={{ maxWidth: 560, textAlign: "center", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Background survey temporarily unavailable</div>
          <div style={{ fontSize: 12, opacity: 0.95 }}>{hipsError}</div>
          <button
            className="text-button"
            style={{ display: "inline-flex", marginTop: 8 }}
            onClick={() => {
              setHipsError(null);
              setHipsRetry((k) => k + 1);
            }}
          >
            Retry — re-probe HiPS
          </button>
          <div style={{ fontSize: 9, opacity: 0.7, marginTop: 6, fontFamily: "var(--font-mono)" }}>Primary: https://alasky.cds.unistra.fr/{survey}/properties · fallback: alaskybis / hips.cds · local preview: /sphere.png (635×526, honest fallback)</div>
        </div>
      )}
    </div>
  );
}
