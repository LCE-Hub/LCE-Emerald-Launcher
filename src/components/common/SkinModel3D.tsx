import { useEffect, useRef, memo } from "react";
import * as THREE from "three";
type UVSet = Record<string, number[]>;
interface SkinModel3DProps {
  src: string;
  slim?: boolean;
  capeUrl?: string | null;
  animate?: boolean;
  className?: string;
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

let snapshotChain: Promise<void> = Promise.resolve();
const snapshotCache = new Map<string, string>();
function createFaceMaterial(
  tex: THREE.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  flipX = false,
  flipY = false,
) {
  const img = tex.image as { width: number; height: number } | undefined;
  const imgH = img && img.height ? img.height : 64;
  const matTex = tex.clone();
  matTex.repeat.set((flipX ? -w : w) / 64, (flipY ? -h : h) / imgH);
  matTex.offset.set((flipX ? x + w : x) / 64, 1 - (flipY ? y : y + h) / imgH);
  matTex.needsUpdate = true;
  return new THREE.MeshLambertMaterial({
    map: matTex,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.FrontSide,
  });
}

function createPart(
  tex: THREE.Texture,
  w: number,
  h: number,
  d: number,
  uv: UVSet,
  overlayUv?: UVSet,
  swapMats = false,
  isLegacyMirror = false,
) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const getMats = (uvSet: UVSet) => {
    const flipX = isLegacyMirror;
    return [
      createFaceMaterial(
        tex,
        swapMats ? uvSet.right[0] : uvSet.left[0],
        uvSet.left[1],
        uvSet.left[2],
        uvSet.left[3],
        flipX,
      ),
      createFaceMaterial(
        tex,
        swapMats ? uvSet.left[0] : uvSet.right[0],
        uvSet.right[1],
        uvSet.right[2],
        uvSet.right[3],
        flipX,
      ),
      createFaceMaterial(
        tex,
        uvSet.top[0],
        uvSet.top[1],
        uvSet.top[2],
        uvSet.top[3],
        flipX,
        true,
      ),
      createFaceMaterial(
        tex,
        uvSet.bottom[0],
        uvSet.bottom[1],
        uvSet.bottom[2],
        uvSet.bottom[3],
        flipX,
        true,
      ),
      createFaceMaterial(
        tex,
        uvSet.front[0],
        uvSet.front[1],
        uvSet.front[2],
        uvSet.front[3],
        flipX,
      ),
      createFaceMaterial(
        tex,
        uvSet.back[0],
        uvSet.back[1],
        uvSet.back[2],
        uvSet.back[3],
        !flipX,
      ),
    ];
  };
  group.add(new THREE.Mesh(geo, getMats(uv)));
  if (overlayUv) {
    const oGeo = new THREE.BoxGeometry(w + 0.5, h + 0.5, d + 0.5);
    group.add(new THREE.Mesh(oGeo, getMats(overlayUv)));
  }
  return group;
}

const limbUv = (x: number, y: number, w = 4): UVSet => ({
  top: [x + 4, y, w, 4],
  bottom: [x + 4 + w, y, w, 4],
  right: [x, y + 4, 4, 12],
  front: [x + 4, y + 4, w, 12],
  left: [x + 4 + w, y + 4, 4, 12],
  back: [x + 8 + w, y + 4, w, 12],
});

function buildPlayer(
  playerGroup: THREE.Group,
  texture: THREE.Texture,
  slimOpt?: boolean,
) {
  const img = texture.image as HTMLImageElement;
  const isLegacy = (img?.height || 64) === 32;
  const isSlim =
    slimOpt !== undefined
      ? slimOpt
      : !isLegacy &&
        (() => {
          const canvas = document.createElement("canvas");
          canvas.width = img?.width || 64;
          canvas.height = img?.height || 64;
          const ctx = canvas.getContext("2d");
          if (!ctx) return false;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try {
            return ctx.getImageData(42, 48, 1, 1).data[3] === 0;
          } catch {
            return false;
          }
        })();
  const armW = isSlim ? 3 : 4;
  const headUv: UVSet = {
    top: [8, 0, 8, 8],
    bottom: [16, 0, 8, 8],
    right: [0, 8, 8, 8],
    left: [16, 8, 8, 8],
    front: [8, 8, 8, 8],
    back: [24, 8, 8, 8],
  };
  const hatUv: UVSet = {
    top: [40, 0, 8, 8],
    bottom: [48, 0, 8, 8],
    right: [32, 8, 8, 8],
    left: [48, 8, 8, 8],
    front: [40, 8, 8, 8],
    back: [56, 8, 8, 8],
  };
  const head = createPart(texture, 8, 8, 8, headUv, hatUv);
  head.position.y = 10;
  playerGroup.add(head);
  const bodyUv: UVSet = {
    top: [20, 16, 8, 4],
    bottom: [28, 16, 8, 4],
    right: [16, 20, 4, 12],
    left: [28, 20, 4, 12],
    front: [20, 20, 8, 12],
    back: [32, 20, 8, 12],
  };
  const jacketUv: UVSet = {
    top: [20, 32, 8, 4],
    bottom: [28, 32, 8, 4],
    right: [16, 36, 4, 12],
    left: [28, 36, 4, 12],
    front: [20, 36, 8, 12],
    back: [32, 36, 8, 12],
  };
  playerGroup.add(
    createPart(texture, 8, 12, 4, bodyUv, isLegacy ? undefined : jacketUv),
  );

  const rightArm = createPart(
    texture,
    armW,
    12,
    4,
    limbUv(40, 16, armW),
    isLegacy ? undefined : limbUv(40, 32, armW),
  );
  rightArm.position.set(isSlim ? -5.5 : -6, 0, 0);
  playerGroup.add(rightArm);
  const leftArm = createPart(
    texture,
    armW,
    12,
    4,
    isLegacy ? limbUv(40, 16, armW) : limbUv(32, 48, armW),
    isLegacy ? undefined : limbUv(48, 48, armW),
    isLegacy,
    isLegacy,
  );
  leftArm.position.set(isSlim ? 5.5 : 6, 0, 0);
  playerGroup.add(leftArm);
  const rightLeg = createPart(
    texture,
    4,
    12,
    4,
    limbUv(0, 16),
    isLegacy ? undefined : limbUv(0, 32),
  );
  rightLeg.position.set(-2, -12, 0);
  playerGroup.add(rightLeg);
  const leftLeg = createPart(
    texture,
    4,
    12,
    4,
    isLegacy ? limbUv(0, 16) : limbUv(16, 48),
    isLegacy ? undefined : limbUv(0, 48),
    isLegacy,
    isLegacy,
  );
  leftLeg.position.set(2, -12, 0);
  playerGroup.add(leftLeg);
}

function addCape(playerGroup: THREE.Group, texture: THREE.Texture) {
  const capeUv: UVSet = {
    top: [1, 0, 10, 1],
    bottom: [11, 0, 10, 1],
    right: [0, 1, 1, 16],
    front: [1, 1, 10, 16],
    left: [11, 1, 1, 16],
    back: [12, 1, 10, 16],
  };
  const capeGroup = new THREE.Group();
  const capeGeo = new THREE.BoxGeometry(10, 16, 1);
  const capeMats = [
    createFaceMaterial(
      texture,
      capeUv.left[0],
      capeUv.left[1],
      capeUv.left[2],
      capeUv.left[3],
    ),
    createFaceMaterial(
      texture,
      capeUv.right[0],
      capeUv.right[1],
      capeUv.right[2],
      capeUv.right[3],
    ),
    createFaceMaterial(
      texture,
      capeUv.top[0],
      capeUv.top[1],
      capeUv.top[2],
      capeUv.top[3],
      false,
      true,
    ),
    createFaceMaterial(
      texture,
      capeUv.bottom[0],
      capeUv.bottom[1],
      capeUv.bottom[2],
      capeUv.bottom[3],
      false,
      true,
    ),
    createFaceMaterial(
      texture,
      capeUv.back[0],
      capeUv.back[1],
      capeUv.back[2],
      capeUv.back[3],
    ),
    createFaceMaterial(
      texture,
      capeUv.front[0],
      capeUv.front[1],
      capeUv.front[2],
      capeUv.front[3],
    ),
  ];
  const capeMesh = new THREE.Mesh(capeGeo, capeMats);
  capeMesh.position.set(0, -8, -0.5);
  capeGroup.add(capeMesh);
  capeGroup.position.set(0, 6, -2.35);
  capeGroup.rotation.x = 0.15;
  playerGroup.add(capeGroup);
}

function fitCamera(camera: THREE.PerspectiveCamera, target: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(target);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const distance = maxDim / (2 * Math.tan(vFov / 2) * 0.72);
  camera.position.set(center.x, center.y, center.z + distance);
  camera.lookAt(center);
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(10, 20, 10);
  scene.add(dl);
}

function disposeScene(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  extraTextures: THREE.Texture[],
) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.geometry) object.geometry.dispose();
      const mats = Array.isArray(object.material)
        ? object.material
        : [object.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  extraTextures.forEach((t) => t.dispose());
  renderer.dispose();
}

function renderSkinSnapshot(opts: {
  src: string;
  slim?: boolean;
  capeUrl?: string | null;
  width: number;
  height: number;
}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = opts.width;
    canvas.height = opts.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("no 2d context"));
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      35,
      opts.width / opts.height,
      0.1,
      1000,
    );
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(opts.width, opts.height);
    addLights(scene);
    const playerGroup = new THREE.Group();
    scene.add(playerGroup);
    const extraTextures: THREE.Texture[] = [];
    let active = true;
    let skinDone = false;
    let capeDone = !opts.capeUrl;
    const finish = () => {
      if (!active || !skinDone || !capeDone) return;
      fitCamera(camera, playerGroup);
      renderer.render(scene, camera);
      ctx.drawImage(renderer.domElement, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      disposeScene(scene, renderer, extraTextures);
      active = false;
      resolve(dataUrl);
    };
    const fail = (err: unknown) => {
      if (!active) return;
      active = false;
      disposeScene(scene, renderer, extraTextures);
      reject(err);
    };
    const loader = new THREE.TextureLoader();
    loader.load(
      opts.src,
      (tex) => {
        if (!active) return;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        buildPlayer(playerGroup, tex, opts.slim);
        extraTextures.push(tex);
        skinDone = true;
        finish();
      },
      undefined,
      fail,
    );
    if (opts.capeUrl) {
      loader.load(
        opts.capeUrl,
        (tex) => {
          if (!active) return;
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          addCape(playerGroup, tex);
          extraTextures.push(tex);
          capeDone = true;
          finish();
        },
        undefined,
        fail,
      );
    }
  });
}

export function getSkinModelSnapshot(opts: {
  src: string;
  slim?: boolean;
  capeUrl?: string | null;
  width: number;
  height: number;
}): Promise<string> {
  const key = `${opts.src}\u0000${opts.slim ? 1 : 0}\u0000${opts.capeUrl || ""}`;
  const hit = snapshotCache.get(key);
  if (hit) return Promise.resolve(hit);
  const result = snapshotChain.then(() => renderSkinSnapshot(opts));
  snapshotChain = result.then(
    () => undefined,
    () => undefined,
  );
  result.then((dataUrl) => snapshotCache.set(key, dataUrl)).catch(() => {});
  return result;
}

const SkinModel3D = memo(function SkinModel3D({
  src,
  slim,
  capeUrl,
  animate,
  className,
}: SkinModel3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const width = el.clientWidth || 240;
    const height = el.clientHeight || 320;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    el.innerHTML = "";
    el.appendChild(renderer.domElement);
    addLights(scene);
    const playerGroup = new THREE.Group();
    scene.add(playerGroup);
    const extraTextures: THREE.Texture[] = [];
    let built = false;
    let disposed = false;
    let rotY = -0.35;
    let rotX = 0.06;
    let dragging = false;
    let raf = 0;
    let lastX = 0;
    let lastY = 0;

    const render = () => {
      if (!disposed) renderer.render(scene, camera);
    };

    const onMouseDown = (e: MouseEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging || disposed) return;
      rotY += (e.clientX - lastX) * 0.01;
      rotX = clamp(rotX + (e.clientY - lastY) * 0.01, -0.6, 0.6);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMouseUp = () => {
      dragging = false;
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      dragging = true;
      lastX = t.clientX;
      lastY = t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging || disposed) return;
      const t = e.touches[0];
      if (!t) return;
      rotY += (t.clientX - lastX) * 0.01;
      rotX = clamp(rotX + (t.clientY - lastY) * 0.01, -0.6, 0.6);
      lastX = t.clientX;
      lastY = t.clientY;
    };
    const onTouchEnd = () => {
      dragging = false;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (animate && !dragging) rotY += 0.004;
      if (animate || dragging) {
        playerGroup.rotation.y = rotY;
        playerGroup.rotation.x = rotX;
        render();
      }
    };

    const handleResize = () => {
      if (!mountRef.current || disposed) return;
      const w = mountRef.current.clientWidth || width;
      const h = mountRef.current.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (built) fitCamera(camera, playerGroup);
      render();
    };

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("resize", handleResize);
      disposeScene(scene, renderer, extraTextures);
    };

    const loader = new THREE.TextureLoader();
    let skinLoaded = false;
    let capeLoaded = !capeUrl;
    const tryFinish = () => {
      if (!skinLoaded || !capeLoaded || disposed) return;
      built = true;
      fitCamera(camera, playerGroup);
      render();
      loop();
    };
    loader.load(
      src,
      (tex) => {
        if (disposed) return;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        buildPlayer(playerGroup, tex, slim);
        extraTextures.push(tex);
        skinLoaded = true;
        tryFinish();
      },
      undefined,
      () => dispose(),
    );
    if (capeUrl) {
      loader.load(
        capeUrl,
        (tex) => {
          if (disposed) return;
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          tex.colorSpace = THREE.SRGBColorSpace;
          addCape(playerGroup, tex);
          extraTextures.push(tex);
          capeLoaded = true;
          tryFinish();
        },
        undefined,
        () => dispose(),
      );
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("touchstart", onTouchStart, {
      passive: true,
    });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("resize", handleResize);

    return dispose;
  }, [src, slim, capeUrl, animate]);

  return <div ref={mountRef} className={className} />;
});

export default SkinModel3D;
