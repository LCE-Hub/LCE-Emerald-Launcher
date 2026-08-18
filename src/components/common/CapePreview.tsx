import { useEffect, useRef, memo } from "react";
import * as THREE from "three";
interface CapePreviewProps {
  src: string;
  className?: string;
}

const CapePreview = memo(function CapePreview({
  src,
  className,
}: CapePreviewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth || 64;
    const height = mountRef.current.clientHeight || 64;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    camera.position.set(0, 0, 30);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(10, 20, 10);
    scene.add(dl);
    const group = new THREE.Group();
    group.rotation.y = -0.35;
    scene.add(group);
    groupRef.current = group;
    const render = () => renderer.render(scene, camera);
    const textureLoader = new THREE.TextureLoader();
    let active = true;
    textureLoader.load(
      src,
      (texture) => {
        if (!active) return;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.colorSpace = THREE.SRGBColorSpace;
        const texW = texture.image.width || 64;
        const texH = texture.image.height || 32;
        const createFace = (
          x: number,
          y: number,
          w: number,
          h: number,
          flipX = false,
          flipY = false,
        ) => {
          const matTex = texture.clone();
          matTex.repeat.set((flipX ? -w : w) / texW, (flipY ? -h : h) / texH);
          matTex.offset.set(
            (flipX ? x + w : x) / texW,
            1 - (flipY ? y : y + h) / texH,
          );
          matTex.needsUpdate = true;
          return new THREE.MeshLambertMaterial({
            map: matTex,
            transparent: true,
            alphaTest: 0.5,
            side: THREE.FrontSide,
          });
        };

        const capeUv = {
          top: [1, 0, 10, 1],
          bottom: [11, 0, 10, 1],
          right: [0, 1, 1, 16],
          front: [1, 1, 10, 16],
          left: [11, 1, 1, 16],
          back: [12, 1, 10, 16],
        };
        const geo = new THREE.BoxGeometry(10, 16, 1);
        const mats = [
          createFace(
            capeUv.left[0],
            capeUv.left[1],
            capeUv.left[2],
            capeUv.left[3],
          ),
          createFace(
            capeUv.right[0],
            capeUv.right[1],
            capeUv.right[2],
            capeUv.right[3],
          ),
          createFace(
            capeUv.top[0],
            capeUv.top[1],
            capeUv.top[2],
            capeUv.top[3],
            false,
            true,
          ),
          createFace(
            capeUv.bottom[0],
            capeUv.bottom[1],
            capeUv.bottom[2],
            capeUv.bottom[3],
            false,
            true,
          ),
          createFace(
            capeUv.front[0],
            capeUv.front[1],
            capeUv.front[2],
            capeUv.front[3],
          ),
          createFace(
            capeUv.back[0],
            capeUv.back[1],
            capeUv.back[2],
            capeUv.back[3],
          ),
        ];
        group.add(new THREE.Mesh(geo, mats));
        render();
      },
      undefined,
      () => {
        render();
      },
    );

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging && groupRef.current) {
        groupRef.current.rotation.y +=
          (e.clientX - previousMousePosition.x) * 0.01;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        render();
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      isDragging = true;
      previousMousePosition = { x: t.clientX, y: t.clientY };
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (isDragging && groupRef.current && t) {
        e.preventDefault();
        groupRef.current.rotation.y +=
          (t.clientX - previousMousePosition.x) * 0.01;
        previousMousePosition = { x: t.clientX, y: t.clientY };
        render();
      }
    };
    const onTouchEnd = () => {
      isDragging = false;
    };
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    renderer.domElement.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      active = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => {
                if (mat.map) mat.map.dispose();
                mat.dispose();
              });
            } else {
              if (object.material.map) object.material.map.dispose();
              object.material.dispose();
            }
          }
        }
      });
      renderer.dispose();
    };
  }, [src]);
  return (
    <div
      ref={mountRef}
      className={`w-full h-full cursor-ew-resize ${className ?? ""}`}
    />
  );
});

export default CapePreview;
