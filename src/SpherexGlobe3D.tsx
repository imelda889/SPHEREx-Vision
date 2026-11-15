import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { lonLat2PixNest } from "healpix-ts";

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
const ORDER9_NSIDE = 512;
const ORDER9_PIXELS_PER_TILE = ORDER9_NSIDE * ORDER9_NSIDE;
const POLAR_CAP_BOUNDARY_DEG = (Math.asin(2 / 3) * 180) / Math.PI;
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

function tileUrl(ipix: number, layer: number): string {
  return `${HIPS_ROOT}/Norder0/Dir0/Npix${ipix}_${layer}.png`;
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
    // Initial view: equatorial, looking at RA 180, Dec 0 (avoids south pole).
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

    const fetchTileData = async (ipix: number, layer: number): Promise<ImageData | null> => {
      if (BLANK_FRAMES.has(layer)) return null;
      try {
        const response = await fetch(tileUrl(ipix, layer), { mode: "cors", cache: "force-cache" });
        if (!response.ok || gen !== genRef.current) return null;
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = new OffscreenCanvas(512, 512);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          bitmap.close();
          throw new Error("Could not read the SPHEREx HiPS tile.");
        }
        context.drawImage(bitmap, 0, 0, 512, 512);
        const data = context.getImageData(0, 0, 512, 512);
        bitmap.close();
        return data;
      } catch (cause) {
        if (gen === genRef.current) console.error(`SPHEREx tile ${ipix}, layer ${layer} failed:`, cause);
        return null;
      }
    };

    const renderGlobeTexture = async () => {
      const tileLayers = await Promise.all(
        Array.from({ length: 12 }, (_, ipix) =>
          Promise.all(uniqueLayers.map((layer) => fetchTileData(ipix, layer))),
        ),
      );
      if (gen !== genRef.current) return;

      const availableTiles = tileLayers.filter((layers) => layers.every(Boolean)).length;
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_WIDTH;
      canvas.height = TEXTURE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        setLoading(false);
        setError("This browser could not create the canvas needed to render the SPHEREx globe.");
        return;
      }

      const image = context.createImageData(TEXTURE_WIDTH, TEXTURE_HEIGHT);
      for (let y = 0; y < TEXTURE_HEIGHT; y++) {
        if (gen !== genRef.current) return;
        const dec = 90 - ((y + 0.5) / TEXTURE_HEIGHT) * 180;
        for (let x = 0; x < TEXTURE_WIDTH; x++) {
          const ra = (180 + ((x + 0.5) / TEXTURE_WIDTH) * 360) % 360;
          let lon = ra > 180 ? ra - 360 : ra;
          if (dec >= POLAR_CAP_BOUNDARY_DEG && (lon === 0 || lon === 180)) lon += 1e-9;

          const nestedPixel = lonLat2PixNest(ORDER9_NSIDE, lon, dec);
          const tileIndex = Math.floor(nestedPixel / ORDER9_PIXELS_PER_TILE);
          const nestedSubpixel = nestedPixel % ORDER9_PIXELS_PER_TILE;
          let sx = 0;
          let sy = 0;
          for (let bit = 0; bit < 9; bit++) {
            sx |= ((nestedSubpixel >> (2 * bit)) & 1) << bit;
            sy |= ((nestedSubpixel >> (2 * bit + 1)) & 1) << bit;
          }

          const sourceIndex = (sx * ORDER9_NSIDE + sy) * 4;
          const layers = tileLayers[tileIndex];
          const targetIndex = (y * TEXTURE_WIDTH + x) * 4;
          if (allSkyMode === "rgb") {
            const shortData = layers[uniqueLayers.indexOf(shortLayer)]?.data;
            const medData = layers[uniqueLayers.indexOf(medLayer)]?.data;
            const longData = layers[uniqueLayers.indexOf(longLayer)]?.data;
            if (!shortData || !medData || !longData) continue;
            const blue = shortData[sourceIndex];
            const green = medData[sourceIndex];
            const red = longData[sourceIndex];
            if (red === 0 || green === 0 || blue === 0) continue;
            image.data[targetIndex] = red;
            image.data[targetIndex + 1] = green;
            image.data[targetIndex + 2] = blue;
          } else {
            const data = layers[uniqueLayers.indexOf(singleLayer)]?.data;
            const value = data?.[sourceIndex];
            if (value === undefined || value === 0) continue;
            image.data[targetIndex] = value;
            image.data[targetIndex + 1] = value;
            image.data[targetIndex + 2] = value;
          }
          image.data[targetIndex + 3] = 255;
        }
      }

      if (gen !== genRef.current) return;
      context.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.RepeatWrapping;

      const geometry = new THREE.SphereGeometry(1.001, 128, 64);
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      });
      tileGroup.add(new THREE.Mesh(geometry, material));
      tilesRef.current.set("equirectangular", texture);

      setLoading(false);
      setStatus(
        allSkyMode === "rgb"
          ? `SPHEREx DR1 3D Globe — False-Colour RGB (B=${SPHEREX_WAVELENGTHS[shortLayer].toFixed(3)} G=${SPHEREX_WAVELENGTHS[medLayer].toFixed(3)} R=${SPHEREX_WAVELENGTHS[longLayer].toFixed(3)} µm) — ${availableTiles}/12 tiles`
          : `SPHEREx DR1 3D Globe — Single Band ${SPHEREX_WAVELENGTHS[singleLayer].toFixed(3)} µm — ${availableTiles}/12 tiles`
      );
      if (availableTiles < 12) {
        setError(
          availableTiles === 0
            ? "Official SPHEREx HiPS tiles are unavailable. Try again later; no substitute data is shown."
            : `Only ${availableTiles} of 12 official SPHEREx HiPS tiles loaded. The globe is incomplete; no substitute data is shown.`,
        );
      }
    };

    void renderGlobeTexture().catch((cause: unknown) => {
      if (gen !== genRef.current) return;
      console.error("Could not render the SPHEREx globe:", cause);
      setLoading(false);
      setError("The SPHEREx globe could not be rendered. Try again.");
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

  // The visible center of the opaque globe is the point nearest the camera.
  useEffect(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const interval = setInterval(() => {
      const dir = camera.position.clone().normalize();
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
        <span style={{ display: "block", fontSize: 8, opacity: 0.7 }}>Official SPHEREx HiPS data reprojected using HEALPix coordinates. Click a sky position to select it.</span>
      </div>
      <div role="note" style={{ position: "absolute", bottom: 90, left: 10, maxWidth: "calc(100% - 20px)", background: "rgba(4,8,15,0.92)", border: "1px solid #26374b", borderRadius: 6, padding: "6px 9px", fontSize: 10, color: "#f1f5f9", zIndex: 4 }}>
        Click the globe to select a sky position. Drag to rotate; scroll to zoom.
      </div>
      <div style={{ position: "absolute", top: 10, right: 10, zIndex: 3 }}>
        <a href={`https://irsa.ipac.caltech.edu/irsaviewer?api=hips&uri=${encodeURIComponent(HIPS_ROOT)}&ra=180&dec=0&sr=180d`} target="_blank" rel="noopener noreferrer" className="text-button" style={{ fontSize: 9, background: "rgba(4,8,15,0.88)", border: "1px solid #26374b", borderRadius: 999, padding: "4px 10px" }}>
          Open Official SPHEREx Cube in IRSA Viewer ↗
        </a>
      </div>
    </div>
  );
}
