import { useEffect, useRef, memo } from "react";
import * as THREE from "three";

type UVSet = Record<string, number[]>;

interface SkinEditorPreviewProps {
  canvas: HTMLCanvasElement | null;
  slim: boolean;
  previewTick: number;
}

const SkinEditorPreview = memo(function SkinEditorPreview({
  canvas,
  slim,
  previewTick,
}: SkinEditorPreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const clonedTexsRef = useRef<THREE.Texture[]>([]);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const rebuildPlayerRef = useRef<((source: HTMLCanvasElement, isSlim: boolean) => void) | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    
    const width = mountRef.current.clientWidth || 240;
    const height = mountRef.current.clientHeight || 400;
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    camera.position.set(0, 0, 68);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);

    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(10, 20, 10);
    scene.add(dl);

    const playerGroup = new THREE.Group();
    playerGroup.position.y = -1.5;
    scene.add(playerGroup);

    const render = () => renderer.render(scene, camera);
    requestRenderRef.current = render;

    const clearPlayer = () => {
      while (playerGroup.children.length) {
        const obj = playerGroup.children[0];
        playerGroup.remove(obj);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
              if (mat.map) mat.map.dispose();
              mat.dispose();
            });
          }
        });
      }
      clonedTexsRef.current = [];
    };

    let hasInitRot = false;
    rebuildPlayerRef.current = (source: HTMLCanvasElement, isSlim: boolean) => {
      const rotX = playerGroup.rotation.x;
      const rotY = playerGroup.rotation.y;
      clearPlayer();
      const texH = source.height || 64;
      const isLegacy = texH === 32;
      const armW = isSlim ? 3 : 4;
      const base = new THREE.CanvasTexture(source);
      base.magFilter = THREE.NearestFilter;
      base.minFilter = THREE.NearestFilter;
      base.colorSpace = THREE.SRGBColorSpace;
      base.needsUpdate = true;

      const createFaceMaterial = (x: number, y: number, w: number, h: number, flipX = false, flipY = false) => {
        const matTex = base.clone();
        matTex.magFilter = THREE.NearestFilter;
        matTex.minFilter = THREE.NearestFilter;
        matTex.colorSpace = THREE.SRGBColorSpace;
        matTex.repeat.set((flipX ? -w : w) / 64, (flipY ? -h : h) / texH);
        matTex.offset.set((flipX ? x + w : x) / 64, 1 - (flipY ? y : y + h) / texH);
        matTex.needsUpdate = true;
        clonedTexsRef.current.push(matTex);
        return new THREE.MeshLambertMaterial({ map: matTex, transparent: true, alphaTest: 0.05, side: THREE.FrontSide });
      };

      const createPart = (w: number, h: number, d: number, uv: UVSet, overlayUv?: UVSet, swapMats = false, isLegacyMirror = false) => {
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(w, h, d);
        const getMats = (uvSet: UVSet) => {
          const flipX = isLegacyMirror;
          //+x is the characters left from the camera, this isnt swapped by accident
          return [
            createFaceMaterial(swapMats ? uvSet.right[0] : uvSet.left[0], uvSet.left[1], uvSet.left[2], uvSet.left[3], flipX),
            createFaceMaterial(swapMats ? uvSet.left[0] : uvSet.right[0], uvSet.right[1], uvSet.right[2], uvSet.right[3], flipX),
            createFaceMaterial(uvSet.top[0], uvSet.top[1], uvSet.top[2], uvSet.top[3], flipX, true),
            createFaceMaterial(uvSet.bottom[0], uvSet.bottom[1], uvSet.bottom[2], uvSet.bottom[3], flipX, true),
            createFaceMaterial(uvSet.front[0], uvSet.front[1], uvSet.front[2], uvSet.front[3], flipX),
            createFaceMaterial(uvSet.back[0], uvSet.back[1], uvSet.back[2], uvSet.back[3], !flipX)
          ];
        };
        group.add(new THREE.Mesh(geo, getMats(uv)));
        if (overlayUv) {
          const oGeo = new THREE.BoxGeometry(w + 0.5, h + 0.5, d + 0.5);
          group.add(new THREE.Mesh(oGeo, getMats(overlayUv)));
        }
        return group;
      };

      const limbUv = (x: number, y: number, w = 4): UVSet => ({
        top: [x + 4, y, w, 4], bottom: [x + 4 + w, y, w, 4],
        right: [x, y + 4, 4, 12], front: [x + 4, y + 4, w, 12],
        left: [x + 4 + w, y + 4, 4, 12], back: [x + 8 + w, y + 4, w, 12]
      });

      const headUv = { top: [8, 0, 8, 8], bottom: [16, 0, 8, 8], right: [0, 8, 8, 8], left: [16, 8, 8, 8], front: [8, 8, 8, 8], back: [24, 8, 8, 8] };
      const hatUv = { top: [40, 0, 8, 8], bottom: [48, 0, 8, 8], right: [32, 8, 8, 8], left: [48, 8, 8, 8], front: [40, 8, 8, 8], back: [56, 8, 8, 8] };
      const head = createPart(8, 8, 8, headUv, hatUv);
      head.position.y = 10;
      playerGroup.add(head);

      const bodyUv = { top: [20, 16, 8, 4], bottom: [28, 16, 8, 4], right: [16, 20, 4, 12], left: [28, 20, 4, 12], front: [20, 20, 8, 12], back: [32, 20, 8, 12] };
      const jacketUv = isLegacy ? undefined : { top: [20, 32, 8, 4], bottom: [28, 32, 8, 4], right: [16, 36, 4, 12], left: [28, 36, 4, 12], front: [20, 36, 8, 12], back: [32, 36, 8, 12] };
      playerGroup.add(createPart(8, 12, 4, bodyUv, jacketUv));

      const rightArm = createPart(armW, 12, 4, limbUv(40, 16, armW), isLegacy ? undefined : limbUv(40, 32, armW));
      rightArm.position.set(isSlim ? -5.5 : -6, 0, 0);
      playerGroup.add(rightArm);

      const leftArm = createPart(armW, 12, 4, isLegacy ? limbUv(40, 16, armW) : limbUv(32, 48, armW), isLegacy ? undefined : limbUv(48, 48, armW), isLegacy, isLegacy);
      leftArm.position.set(isSlim ? 5.5 : 6, 0, 0);
      playerGroup.add(leftArm);

      const rightLeg = createPart(4, 12, 4, limbUv(0, 16), isLegacy ? undefined : limbUv(0, 32));
      rightLeg.position.set(-2, -12, 0);
      playerGroup.add(rightLeg);

      const leftLeg = createPart(4, 12, 4, isLegacy ? limbUv(0, 16) : limbUv(16, 48), isLegacy ? undefined : limbUv(0, 48), isLegacy, isLegacy);
      leftLeg.position.set(2, -12, 0);
      playerGroup.add(leftLeg);

      clonedTexsRef.current.unshift(base);
      playerGroup.rotation.x = rotX;
      playerGroup.rotation.y = hasInitRot ? rotY : -0.35;
      hasInitRot = true;
      render();
    };

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      playerGroup.rotation.y += (e.clientX - previousMousePosition.x) * 0.01;
      playerGroup.rotation.x += (e.clientY - previousMousePosition.y) * 0.01;
      previousMousePosition = { x: e.clientX, y: e.clientY };
      render();
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(40, Math.min(120, camera.position.z + e.deltaY * 0.05));
      render();
    };

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || width;
      const h = mountRef.current.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      render();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("wheel", onWheel);
      clearPlayer();
      renderer.dispose();
      requestRenderRef.current = null;
      rebuildPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (canvas) rebuildPlayerRef.current?.(canvas, slim);
  }, [canvas, slim]);

  useEffect(() => {
    clonedTexsRef.current.forEach((t) => { t.needsUpdate = true; });
    requestRenderRef.current?.();
  }, [previewTick]);

  return <div ref={mountRef} className="w-full h-full cursor-ew-resize" />;
});

export default SkinEditorPreview;
