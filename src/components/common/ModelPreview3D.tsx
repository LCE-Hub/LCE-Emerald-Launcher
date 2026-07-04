import { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ModelFile } from "../../types/model";
interface ModelPreview3DProps {
  model: ModelFile | null;
  selectedPart?: string | null;
  showBounds?: boolean;
  className?: string;
}

const PART_COLORS = [
  0xff5555, 0x55ff55, 0x5555ff, 0xffff55, 0xff55ff, 0x55ffff, 0xff8855,
  0x88ff55, 0x5588ff, 0xff5588, 0x55ff88, 0x8855ff, 0xff8855, 0x55ffaa,
  0xaa55ff,
];

interface FaceUV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  u2: number;
  v2: number;
  u3: number;
  v3: number;
}

function getFaceUV(
  face: number,
  ux: number,
  uy: number,
  w: number,
  h: number,
  d: number,
  tw: number,
  th: number,
): FaceUV {
  const toU = (px: number) => Math.max(0, px) / tw;
  const toV = (py: number) => 1 - Math.max(0, py) / th;
  switch (face) {
    case 0: {
      const l = ux + d;
      const t = uy + d;
      const r = ux + w;
      const b = uy + h - d;
      return {
        u0: toU(l),
        v0: toV(t),
        u1: toU(r),
        v1: toV(t),
        u2: toU(l),
        v2: toV(b),
        u3: toU(r),
        v3: toV(b),
      };
    }
    case 1: {
      const l = ux;
      const t = uy + d;
      const r = ux + d;
      const b = uy + h - d;
      return {
        u0: toU(r),
        v0: toV(t),
        u1: toU(l),
        v1: toV(t),
        u2: toU(r),
        v2: toV(b),
        u3: toU(l),
        v3: toV(b),
      };
    }
    case 2: {
      const l = ux + d;
      const t = uy;
      const r = ux + w - d;
      const b = uy + d;
      return {
        u0: toU(l),
        v0: toV(b),
        v1: toV(b),
        u1: toU(r),
        u2: toU(l),
        v2: toV(t),
        u3: toU(r),
        v3: toV(t),
      };
    }
    case 3: {
      const l = ux + w;
      const t = uy;
      const r = ux + w + d;
      const b = uy + d;
      return {
        u0: toU(l),
        v0: toV(t),
        u1: toU(r),
        v1: toV(t),
        u2: toU(l),
        v2: toV(b),
        u3: toU(r),
        v3: toV(b),
      };
    }
    case 4: {
      const l = ux + d;
      const t = uy + d;
      const r = ux + w - d;
      const b = uy + h - d;
      return {
        u0: toU(r),
        v0: toV(t),
        u1: toU(l),
        v1: toV(t),
        u2: toU(r),
        v2: toV(b),
        u3: toU(l),
        v3: toV(b),
      };
    }
    case 5: {
      const l = ux + d + w;
      const t = uy + d;
      const r = ux + d + w + d;
      const b = uy + h - d;
      return {
        u0: toU(l),
        v0: toV(t),
        u1: toU(r),
        v1: toV(t),
        u2: toU(l),
        v2: toV(b),
        u3: toU(r),
        v3: toV(b),
      };
    }
    default:
      return { u0: 0, v0: 0, u1: 1, v1: 0, u2: 0, v2: 1, u3: 1, v3: 1 };
  }
}

export default function ModelPreview3D({
  model,
  selectedPart,
  showBounds,
  className,
}: ModelPreview3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshGroupRef = useRef<THREE.Group>(new THREE.Group());
  const controlsRef = useRef<OrbitControls | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!model?.textures?.length) {
      setTexture(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = model.textures[0].data;
    return () => {
      img.onload = null;
    };
  }, [model]);

  const buildModel = useCallback(() => {
    const group = meshGroupRef.current;
    while (group.children.length) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        child.material.dispose();
      }
    }

    if (!model) return;
    const atlas = texture;
    const tw = model.textureSize.X;
    const th = model.textureSize.Y;
    const gridHelper = new THREE.GridHelper(30, 10, 0x444444, 0x222222);
    gridHelper.position.y = -12;
    group.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.position.set(-20, -12, -20);
    group.add(axesHelper);
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    model.parts.forEach((part, pi) => {
      const color = PART_COLORS[pi % PART_COLORS.length];
      const isSelected = selectedPart === part.name;
      const tx = part.translation?.X ?? 0;
      const ty = part.translation?.Y ?? 0;
      const tz = part.translation?.Z ?? 0;
      part.boxes.forEach((box) => {
        const w = box.size.X;
        const h = box.size.Y;
        const d = box.size.Z;
        const ux = box.uv.X;
        const uy = box.uv.Y;
        const cx = box.pos.X + w / 2 + tx;
        const cy = box.pos.Y + h / 2 + ty;
        const cz = box.pos.Z + d / 2 + tz;
        minX = Math.min(minX, box.pos.X + tx);
        minY = Math.min(minY, box.pos.Y + ty);
        minZ = Math.min(minZ, box.pos.Z + tz);
        maxX = Math.max(maxX, box.pos.X + w + tx);
        maxY = Math.max(maxY, box.pos.Y + h + ty);
        maxZ = Math.max(maxZ, box.pos.Z + d + tz);
        const geo = new THREE.BoxGeometry(w, h, d);
        if (atlas && tw && th) {
          const uvAttr = geo.attributes.uv;
          const uvs = uvAttr.array;
          for (let f = 0; f < 6; f++) {
            const faceUV = getFaceUV(f, ux, uy, w, h, d, tw, th);
            uvs[f * 8 + 0] = faceUV.u0;
            uvs[f * 8 + 1] = faceUV.v0;
            uvs[f * 8 + 2] = faceUV.u1;
            uvs[f * 8 + 3] = faceUV.v1;
            uvs[f * 8 + 4] = faceUV.u2;
            uvs[f * 8 + 5] = faceUV.v2;
            uvs[f * 8 + 6] = faceUV.u3;
            uvs[f * 8 + 7] = faceUV.v3;
          }
          uvAttr.needsUpdate = true;
        }
        const mat = new THREE.MeshPhongMaterial({
          color: atlas ? 0xffffff : color,
          map: atlas ?? undefined,
          transparent: !atlas,
          opacity: atlas ? 1 : isSelected ? 0.9 : 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(cx, cy, cz);
        group.add(mesh);
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xffff55 : 0x888888,
          transparent: true,
          opacity: isSelected ? 1 : 0.4,
        });
        const edge = new THREE.LineSegments(edgeGeo, edgeMat);
        edge.position.copy(mesh.position);
        group.add(edge);
      });
    });

    if (showBounds && minX !== Infinity) {
      const bw = maxX - minX;
      const bh = maxY - minY;
      const bd = maxZ - minZ;
      const bGeo = new THREE.BoxGeometry(bw, bh, bd);
      const bMat = new THREE.MeshBasicMaterial({
        color: 0xffff55,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.set(
        (minX + maxX) / 2,
        (minY + maxY) / 2,
        (minZ + maxZ) / 2,
      );
      group.add(bMesh);
    }
  }, [model, selectedPart, showBounds, texture]);

  useEffect(() => {
    if (!mountRef.current) return;
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(30, 20, 30);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(10, 20, 10);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dl2.position.set(-10, -5, -10);
    scene.add(dl2);
    scene.add(meshGroupRef.current);
    let animId: number;
    const render = () => {
      animId = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    const resize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    buildModel();
  }, [buildModel]);

  return (
    <div
      ref={mountRef}
      className={className}
      style={{ width: "100%", height: "100%", minHeight: "300px" }}
    />
  );
}
