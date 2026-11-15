import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Order-0 HEALPix pixel centers and vertices (nested, nside=1).
// Source: astropy_healpix, verified 2026-11-14 (Agent A report).
// vertices: [v0, v1, v2, v3] in (ra, dec) degrees.
// Vertices in astropy_healpix order: [v0, v1, v2, v3].
// v0=(0,90) v1=(0,41.81) v2=(45,0) v3=(90,41.81) for ipix 0 (verified 2026-11-15).
const ORDER0_TILES: Array<{ ipix: number; ra: number; dec: number; verts: Array<[number, number]> }> = [
  { ipix: 0, ra: 45, dec: 41.8103, verts: [[0, 90], [0, 41.8103], [45, 0], [90, 41.8103]] },
  { ipix: 1, ra: 135, dec: 41.8103, verts: [[0, 90], [90, 41.8103], [135, 0], [180, 41.8103]] },
  { ipix: 2, ra: 225, dec: 41.8103, verts: [[180, 90], [180, 41.8103], [225, 0], [270, 41.8103]] },
  { ipix: 3, ra: 315, dec: 41.8103, verts: [[180, 90], [270, 41.8103], [315, 0], [0, 41.8103]] },
  { ipix: 4, ra: 0, dec: 0, verts: [[0, 41.8103], [315, 0], [0, -41.8103], [45, 0]] },
  { ipix: 5, ra: 90, dec: 0, verts: [[90, 41.8103], [45, 0], [90, -41.8103], [135, 0]] },
  { ipix: 6, ra: 180, dec: 0, verts: [[180, 41.8103], [135, 0], [180, -41.8103], [225, 0]] },
  { ipix: 7, ra: 270, dec: 0, verts: [[270, 41.8103], [225, 0], [270, -41.8103], [315, 0]] },
  { ipix: 8, ra: 45, dec: -41.8103, verts: [[45, 0], [0, -41.8103], [0, -90], [90, -41.8103]] },
  { ipix: 9, ra: 135, dec: -41.8103, verts: [[135, 0], [90, -41.8103], [0, -90], [180, -41.8103]] },
  { ipix: 10, ra: 225, dec: -41.8103, verts: [[225, 0], [180, -41.8103], [180, -90], [270, -41.8103]] },
  { ipix: 11, ra: 315, dec: -41.8103, verts: [[315, 0], [270, -41.8103], [180, -90], [0, -41.8103]] },
];

// Wavelengths (µm) from official data_cube_crval3_arr (102 values). Frames 50,51 blank.
const SPHEREX_WAVELENGTHS: number[] = [
  0.753,0.771,0.790,0.809,0.828,0.848,0.868,0.889,0.910,0.932,0.955,0.978,1.001,1.025,1.050,1.075,1.102,
  1.113,1.139,1.167,1.195,1.224,1.254,1.284,1.315,1.346,1.378,1.412,1.446,1.481,1.517,1.554,1.592,1.631,1.656,1.695,1.735,1.775,1.818,1.861,1.905,1.949,1.995,2.041,2.089,2.139,2.189,2.240,2.292,2.345,
  2.399,2.445,
  2.506,2.575,2.646,2.719,2.794,2.871,2.951,3.033,3.118,3.204,3.293,3.383,3.476,3.570,3.667,3.768,3.833,3.867,3.901,3.935,3.970,4.005,4.040,4.076,4.112,4.148,4.184,4.220,4.257,4.294,4.331,4.368,4.405,4.435,4.467,4.500,4.533,4.566,4.600,4.635,4.669,4.704,4.739,4.773,4.808,4.843,4.879,4.915,4.951,4.988,
];
const BLANK_FRAMES = new Set([50, 51]);
const HIPS_ROOT = "https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube";
const VALID_LAYERS = Array.from({ length: 102 }, (_, i) => i).filter((i) => !BLANK_FRAMES.has(i));

function tileUrl(ipix: number, layer: number): string {
  const dir = Math.floor(ipix / 10000) * 10000;
  return `${HIPS_ROOT}/Norder0/Dir0/Npix${ipix}_${layer}.png`;
}

function raDecToVec3(ra: number, dec: number, r = 1): THREE.Vector3 {
  const raR = (ra * Math.PI) / 180;
  const decR = (dec * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(decR) * Math.cos(raR),
    r * Math.cos(decR) * Math.sin(raR),
    r * Math.sin(decR)
  );
}

function vec3ToRaDec(v: THREE.Vector3): { ra: number; dec: number } {
  const r = v.length();
  const dec = (Math.asin(v.z / r) * 180) / Math.PI;
  const ra = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
  return { ra, dec };
}

export function SpherexGlobe3D({
  onCenter,
  onFov,
  onCursor,
  onSelect,
  onDoubleClick,
  mode,
}: {
  onCenter: (c: { ra: number; dec: number }) => void;
  onFov: (f: number) => void;
  onCursor: (c: { ra: number; dec: number } | null) => void;
  onSelect: (ra: number, dec: number) => void;
  onDoubleClick?: (ra: number, dec: number) => void;
  mode?: "pan" | "select";
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [allSkyMode, setAllSkyMode] = useState<"rgb" | "single">("single");
  const [shortLayer, setShortLayer] = useState(5);
  const [medLayer, setMedLayer] = useState(52);
  const [longLayer, setLongLayer] = useState(100);
  const [singleLayer, setSingleLayer] = useState(52);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading SPHEREx globe…");
  const [fov, setFov] = useState(60);
  const [retryCount, setRetryCount] = useState(0);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sphereRef = useRef<THREE.Group | null>(null);
  const tilesRef = useRef<Map<string, THREE.Texture>>(new Map());
  const animFrameRef = useRef<number>(0);
  const genRef = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070f);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(fov, container.clientWidth / container.clientHeight, 0.1, 100);
    // Initial view: equatorial, looking at RA ~180, Dec 0 (avoids south pole)
    camera.position.set(3, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 1.2;
    controls.maxDistance = 8;
    controlsRef.current = controls;

    // Base sphere (dark)
    const baseSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.99, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x0a0f1a, side: THREE.BackSide })
    );
    scene.add(baseSphere);

    // Group for tiles
    const tileGroup = new THREE.Group();
    scene.add(tileGroup);
    sphereRef.current = tileGroup;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (!container || !camera || !renderer) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    ro.observe(container);

    // Animation loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      tilesRef.current.forEach((t) => t.dispose());
      tilesRef.current.clear();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tiles when mode/wavelength changes
  useEffect(() => {
    const scene = sceneRef.current;
    const tileGroup = sphereRef.current;
    if (!scene || !tileGroup) return;

    const gen = ++genRef.current;
    setLoading(true);
    setError("");
    setStatus("Loading official SPHEREx tiles…");

    const layers = allSkyMode === "rgb" ? [shortLayer, medLayer, longLayer] : [singleLayer];
    const uniqueLayers = [...new Set(layers)];

    // Dispose existing textures
    tilesRef.current.forEach((tex) => tex.dispose());
    tilesRef.current.clear();

    // Clear existing tiles
    while (tileGroup.children.length > 0) {
      const child = tileGroup.children[0];
      tileGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else if (child.material instanceof THREE.Material) (child.material as THREE.Material).dispose();
      }
    }

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";

    const loadTile = async (tile: typeof ORDER0_TILES[0]) => {
      try {
        const bitmaps: (ImageBitmap | null)[] = await Promise.all(
          uniqueLayers.map(async (l) => {
            if (BLANK_FRAMES.has(l)) return null;
            const url = tileUrl(tile.ipix, l);
            try {
              const res = await fetch(url, { mode: "cors", cache: "force-cache" });
              if (!res.ok) return null;
              if (gen !== genRef.current) return null; // stale
              const blob = await res.blob();
              if (gen !== genRef.current) return null; // stale
              return await createImageBitmap(blob);
            } catch {
              return null;
            }
          })
        );

        if (gen !== genRef.current) return; // stale generation
        const bmp0 = bitmaps[0];
        if (allSkyMode === "rgb" ? bitmaps.some((bitmap) => !bitmap) : !bmp0) return;

        // Create composite canvas
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        if (allSkyMode === "rgb") {
          const shortBmp = bitmaps[uniqueLayers.indexOf(shortLayer)];
          const medBmp = bitmaps[uniqueLayers.indexOf(medLayer)];
          const longBmp = bitmaps[uniqueLayers.indexOf(longLayer)];
          if (!shortBmp || !medBmp || !longBmp) return;
          const tmpCanvas = document.createElement("canvas");
          tmpCanvas.width = 512;
          tmpCanvas.height = 512;
          const tmpCtx = tmpCanvas.getContext("2d", { willReadFrequently: true })!;
          const getPixels = (bmp: ImageBitmap) => {
            tmpCtx.clearRect(0, 0, 512, 512);
            tmpCtx.drawImage(bmp, 0, 0);
            return tmpCtx.getImageData(0, 0, 512, 512).data;
          };
          const sp = getPixels(shortBmp);
          const mp = getPixels(medBmp);
          const lp = getPixels(longBmp);
          const out = ctx.createImageData(512, 512);
          for (let i = 0; i < out.data.length; i += 4) {
            if (
              sp[i] === 0 || mp[i] === 0 || lp[i] === 0 ||
              sp[i + 3] === 0 || mp[i + 3] === 0 || lp[i + 3] === 0
            ) {
              continue;
            }
            out.data[i] = lp[i];
            out.data[i + 1] = mp[i];
            out.data[i + 2] = sp[i];
            out.data[i + 3] = 255;
          }
          ctx.putImageData(out, 0, 0);
        } else {
          if (bmp0) {
            ctx.drawImage(bmp0, 0, 0);
            const image = ctx.getImageData(0, 0, 512, 512);
            for (let i = 0; i < image.data.length; i += 4) {
              if (image.data[i] === 0) image.data[i + 3] = 0;
            }
            ctx.putImageData(image, 0, 0);
          }
        }

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // Build quad geometry from 4 vertices
        // verts: [v0, v1, v2, v3] = (v0=bottom-right, v1=top-right, v2=top-left, v3=bottom-left) in image space
        // UV: v3→(0,0), v0→(1,0), v1→(1,1), v2→(0,1)
        const verts = tile.verts;
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices = [0, 1, 2, 0, 2, 3];

        // v3, v0, v1, v2 order for quad
        const quadVerts = [verts[3], verts[0], verts[1], verts[2]];
        const quadUVs = [[0, 0], [1, 0], [1, 1], [0, 1]];

        for (let i = 0; i < 4; i++) {
          const v = quadVerts[i];
          const vec = raDecToVec3(v[0], v[1], 1.001);
          positions.push(vec.x, vec.y, vec.z);
          uvs.push(quadUVs[i][0], quadUVs[i][1]);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);

        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        tileGroup.add(mesh);

        // Store texture for cleanup
        tilesRef.current.set(`${tile.ipix}`, texture);
      } catch (e) {
        console.error(`Tile ${tile.ipix} failed:`, e);
      }
    };

    // Load all 12 tiles
    Promise.all(ORDER0_TILES.map(loadTile)).then(() => {
      if (gen !== genRef.current) return; // stale generation, discard
      setLoading(false);
      const availableTiles = tileGroup.children.length;
      if (availableTiles < ORDER0_TILES.length) {
        setStatus(`SPHEREx DR1 3D Globe — ${availableTiles}/12 official tiles loaded`);
        setError(
          availableTiles === 0
            ? "Official SPHEREx HiPS tiles are unavailable. Try again later; no substitute data is shown."
            : `Only ${availableTiles} of 12 official SPHEREx HiPS tiles loaded. The globe is incomplete; no substitute data is shown.`,
        );
        return;
      }
      setStatus(
        allSkyMode === "rgb"
          ? `SPHEREx DR1 3D Globe — False-Colour RGB (B=${SPHEREX_WAVELENGTHS[shortLayer].toFixed(3)} G=${SPHEREX_WAVELENGTHS[medLayer].toFixed(3)} R=${SPHEREX_WAVELENGTHS[longLayer].toFixed(3)} µm) — 12/12 tiles`
          : `SPHEREx DR1 3D Globe — Single Band ${SPHEREX_WAVELENGTHS[singleLayer].toFixed(3)} µm — 12/12 tiles`
      );
    });

    return () => {
      // Cleanup handled by main effect
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSkyMode, shortLayer, medLayer, longLayer, singleLayer, retryCount]);

  // Click handler for selection
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!renderer || !camera || !scene) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (e: MouseEvent) => {
      if (mode && mode !== "select") return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].point.clone();
        const { ra, dec } = vec3ToRaDec(hit);
        onSelect(ra, dec);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      if (mode && mode !== "select") return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].point.clone();
        const { ra, dec } = vec3ToRaDec(hit);
        onSelect(ra, dec);
        if (onDoubleClick) onDoubleClick(ra, dec);
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      if (intersects.length > 0) {
        const hit = intersects[0].point.clone();
        const { ra, dec } = vec3ToRaDec(hit);
        onCursor({ ra, dec });
      } else {
        onCursor(null);
      }
    };

    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("dblclick", onDblClick);
    renderer.domElement.addEventListener("mousemove", onMove);
    return () => {
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("dblclick", onDblClick);
      renderer.domElement.removeEventListener("mousemove", onMove);
    };
  }, [mode, onSelect, onCursor]);

  // Cursor tracking for center/fov (already in animation loop via onCenter/onFov)
  // But we need to call them. Let's add a separate effect.
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const interval = setInterval(() => {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      onCenter(vec3ToRaDec(dir));
      const dist = camera.position.length();
      const sphereAngularDiam = dist >= 1 ? (2 * Math.asin(Math.min(1, 1 / dist)) * 180) / Math.PI : 180;
      onFov(Math.min(camera.fov, sphereAngularDiam));
    }, 100);
    return () => clearInterval(interval);
  }, [onCenter, onFov]);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0, background: "#04070f", overflow: "hidden" }}>
      {loading && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: "rgba(4,8,15,0.92)", border: "1px solid #26374b", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f1f5f9", zIndex: 2 }}>
          <span className="spinner" style={{ marginRight: 8 }} /> {status}
        </div>
      )}
      {error && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", background: "rgba(4,8,15,0.92)", border: "1px solid #e07a6a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#f1f5f9", zIndex: 2, textAlign: "center", maxWidth: 400 }}>
          {error}
          <button className="text-button" style={{ display: "block", marginTop: 8, marginLeft: "auto", marginRight: "auto" }} onClick={() => setRetryCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}
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
      <div style={{ position: "absolute", bottom: 42, left: 10, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "4px 10px", fontSize: 9, color: "#8a93a6", zIndex: 3 }}>
        {allSkyMode === "rgb" ? (
          <>False-Colour Spectral Composite — B={SPHEREX_WAVELENGTHS[shortLayer].toFixed(3)} G={SPHEREX_WAVELENGTHS[medLayer].toFixed(3)} R={SPHEREX_WAVELENGTHS[longLayer].toFixed(3)} µm. Not natural colour. Official SPHEREx DR1 HiPS. 3D Globe.</>
        ) : (
          <>Single Wavelength {SPHEREX_WAVELENGTHS[singleLayer].toFixed(3)} µm — Official SPHEREx DR1 HiPS (3D Globe)</>
        )}
        <span style={{ display: "block", fontSize: 8, opacity: 0.7 }}>Official IRSA HiPS tiles on an unvalidated 3D face projection. Visual overview only; use Coverage Map or IRSA for precise feature positions.</span>
      </div>
      <div role="note" style={{ position: "absolute", bottom: 90, left: 10, maxWidth: "calc(100% - 20px)", background: "rgba(4,8,15,0.92)", border: "1px solid #e0a45f", borderRadius: 6, padding: "6px 9px", fontSize: 10, color: "#f1f5f9", zIndex: 4 }}>
        Globe tile positions are not precision-validated. Click selection is disabled; use Coverage Map or IRSA for sky-position searches.
      </div>
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
        <a href={`https://irsa.ipac.caltech.edu/irsaviewer?api=hips&uri=${encodeURIComponent(HIPS_ROOT)}&ra=180&dec=0&sr=180d`} target="_blank" rel="noopener noreferrer" className="text-button" style={{ fontSize: 9, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "4px 10px" }}>
          Open Official SPHEREx Cube in IRSA Viewer ↗
        </a>
      </div>
    </div>
  );
}
