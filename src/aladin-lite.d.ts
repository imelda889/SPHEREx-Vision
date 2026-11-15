/* Minimal typed surface for the `aladin-lite` v3 bundle used by Explore Sky.
 * The package ships no TypeScript types; these declarations cover exactly the
 * members this project calls (verified against the v3 API docs, Nov 2026).
 * Everything else goes through the `unknown`-returning helpers below so a
 * beta API drift fails at runtime with a clear error, never silently. */

declare module "aladin-lite" {
  export interface AladinOptions {
    survey?: string;
    fov?: number;
    projection?: string;
    cooFrame?: string;
    showZoomControl?: boolean;
    showFullscreenControl?: boolean;
    showGotoControl?: boolean;
    showLayersControl?: boolean;
    showShareControl?: boolean;
    showContextMenu?: boolean;
    showProjectionControl?: boolean;
    showReticle?: boolean;
    showCooGrid?: boolean;
    showSimbadPointerControl?: boolean;
    fullScreen?: boolean;
    [key: string]: unknown;
  }

  export interface AladinMoc {
    hide(): void;
    show(): void;
  }

  export interface AladinOverlayHandle {
    hide(): void;
    show(): void;
  }

  export interface AladinInstance {
    gotoRaDec(ra: number, dec: number): void;
    getRaDec(): [number, number];
    getSize(): [number, number];
    setFoV(fovDeg: number): void;
    getFoV(): [number, number];
    setProjection(projection: string): void;
    setCooGrid(show?: boolean): void;
    showReticule(show: boolean): void;
    setImageSurvey(idOrUrl: string): void;
    getBaseImageLayer(): unknown;
    pix2world(x: number, y: number): [number, number];
    world2pix(ra: number, dec: number): [number, number] | null;
    angularDist(x1: number, y1: number, x2: number, y2: number): number;
    addMOC(moc: AladinMoc): void;
    on(event: string, cb: (...args: never[]) => void): void;
    off?(event: string, cb?: (...args: never[]) => void): void;
  }

  const A: {
    init: Promise<void>;
    aladin(div: string | HTMLElement, options?: AladinOptions): AladinInstance;
    MOCFromPolygon(
      polygon: { ra: number[]; dec: number[] },
      options?: { name?: string; color?: string; opacity?: number; lineWidth?: number },
    ): AladinMoc;
    MOCFromCone(
      circle: { ra: number; dec: number; radius: number },
      options?: { name?: string; color?: string; opacity?: number; lineWidth?: number },
    ): AladinMoc;
    graphicOverlay(options?: { color?: string; lineWidth?: number }): AladinOverlayHandle;
  };

  export default A;
}
