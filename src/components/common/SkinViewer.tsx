import { useEffect, useRef, useState, memo } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useConfig } from '../../context/LauncherContext';

interface SkinViewerProps {
  username: string;
  setUsername: (name: string) => void;
  playPressSound: () => void;
  skinUrl: string;
  capeUrl?: string | null;
  setSkinUrl: (url: string) => void;
  setActiveView: (view: string) => void;
  isFocusedSection: boolean;
  onNavigateRight: () => void;
}

const SkinViewer = memo(function SkinViewer({ username, setUsername, playPressSound, skinUrl, capeUrl, setSkinUrl, setActiveView, isFocusedSection, onNavigateRight }: SkinViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const { legacyMode, animationsEnabled } = useConfig();
  const [showLayers, setShowLayers] = useLocalStorage('lce-show-layers', true);
  const overlaysRef = useRef<THREE.Mesh[]>([]);
  const capeRef = useRef<THREE.Group | null>(null);
  const requestRenderRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!mountRef.current) return;
    const width = 260;
    const height = 450;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    camera.position.set(0, 0, 68);
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
    const playerGroup = new THREE.Group();
    playerGroup.position.y = -1.5;
    scene.add(playerGroup);
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(skinUrl || "/images/Default.png", (texture) => {
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      const img = texture.image;
      const isLegacy = img.height === 32;
      const createFaceMaterial = (x: number, y: number, w: number, h: number, flipX = false, flipY = false, tex = texture) => {
        const matTex = tex.clone();
        matTex.repeat.set((flipX ? -w : w) / 64, (flipY ? -h : h) / tex.image.height);
        matTex.offset.set((flipX ? (x + w) : x) / 64, 1 - (flipY ? y : (y + h)) / tex.image.height);
        matTex.needsUpdate = true;
        return new THREE.MeshLambertMaterial({ map: matTex, transparent: true, alphaTest: 0.5, side: THREE.FrontSide });
      };

      const createPart = (w: number, h: number, d: number, uv: any, overlayUv?: any, swapMats = false, isLegacyMirror = false) => {
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(w, h, d);
        const getMats = (uvSet: any) => {
          const flipX = isLegacyMirror;
          return [
            createFaceMaterial(swapMats ? uvSet.right[0] : uvSet.left[0], uvSet.left[1], uvSet.left[2], uvSet.left[3], flipX),     // +x (L)
            createFaceMaterial(swapMats ? uvSet.left[0] : uvSet.right[0], uvSet.right[1], uvSet.right[2], uvSet.right[3], flipX),   // -x (R)
            createFaceMaterial(uvSet.top[0], uvSet.top[1], uvSet.top[2], uvSet.top[3], flipX, true),                           // +y (T)
            createFaceMaterial(uvSet.bottom[0], uvSet.bottom[1], uvSet.bottom[2], uvSet.bottom[3], flipX, true),                        // -y (B)
            createFaceMaterial(uvSet.front[0], uvSet.front[1], uvSet.front[2], uvSet.front[3], flipX),                        // +z (F)
            createFaceMaterial(uvSet.back[0], uvSet.back[1], uvSet.back[2], uvSet.back[3], !flipX)                           // -z (B)
          ];
        };

        const mesh = new THREE.Mesh(geo, getMats(uv));
        group.add(mesh);
        if (overlayUv) {
          const oGeo = new THREE.BoxGeometry(w + 0.5, h + 0.5, d + 0.5);
          const oMesh = new THREE.Mesh(oGeo, getMats(overlayUv));
          oMesh.visible = showLayers;
          overlaysRef.current.push(oMesh);
          group.add(oMesh);
        }
        return group;
      };

      const limbUv = (x: number, y: number, w = 4) => ({
        top: [x + 4, y, w, 4], bottom: [x + 4 + w, y, w, 4],
        right: [x, y + 4, 4, 12], front: [x + 4, y + 4, w, 12],
        left: [x + 4 + w, y + 4, 4, 12], back: [x + 8 + w, y + 4, w, 12]
      });

      const isSlim = !isLegacy && (() => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return false;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(42, 48, 1, 1).data;
        return data[3] === 0;
      })();
      const armW = isSlim ? 3 : 4;
      const headUv = { top: [8, 0, 8, 8], bottom: [16, 0, 8, 8], right: [0, 8, 8, 8], left: [16, 8, 8, 8], front: [8, 8, 8, 8], back: [24, 8, 8, 8] };
      const hatUv = { top: [40, 0, 8, 8], bottom: [48, 0, 8, 8], right: [32, 8, 8, 8], left: [48, 8, 8, 8], front: [40, 8, 8, 8], back: [56, 8, 8, 8] };
      const head = createPart(8, 8, 8, headUv, hatUv);
      head.position.y = 10;
      playerGroup.add(head);
      const bodyUv = { top: [20, 16, 8, 4], bottom: [28, 16, 8, 4], right: [16, 20, 4, 12], left: [28, 20, 4, 12], front: [20, 20, 8, 12], back: [32, 20, 8, 12] };
      const jacketUv = { top: [20, 32, 8, 4], bottom: [28, 32, 8, 4], right: [16, 36, 4, 12], left: [28, 36, 4, 12], front: [20, 36, 8, 12], back: [32, 36, 8, 12] };
      playerGroup.add(createPart(8, 12, 4, bodyUv, isLegacy ? undefined : jacketUv));
      const rightArm = createPart(armW, 12, 4, limbUv(40, 16, armW), isLegacy ? undefined : limbUv(40, 32, armW));
      rightArm.position.set(isSlim ? -5.5 : -6, 0, 0);
      playerGroup.add(rightArm);
      const leftArm = createPart(armW, 12, 4, isLegacy ? limbUv(40, 16, armW) : limbUv(32, 48, armW), isLegacy ? undefined : limbUv(48, 48, armW), true, isLegacy);
      leftArm.position.set(isSlim ? 5.5 : 6, 0, 0);
      playerGroup.add(leftArm);
      const rightLeg = createPart(4, 12, 4, limbUv(0, 16), isLegacy ? undefined : limbUv(0, 32));
      rightLeg.position.set(-2, -12, 0);
      playerGroup.add(rightLeg);
      const leftLeg = createPart(4, 12, 4, isLegacy ? limbUv(0, 16) : limbUv(16, 48), isLegacy ? undefined : limbUv(0, 48), true, isLegacy);
      leftLeg.position.set(2, -12, 0);
      playerGroup.add(leftLeg);
      if (capeUrl) {
        textureLoader.load(capeUrl, (capeTexture) => {
          capeTexture.magFilter = THREE.NearestFilter;
          capeTexture.minFilter = THREE.NearestFilter;
          capeTexture.colorSpace = THREE.SRGBColorSpace;
          const capeUv = {
            top: [1, 0, 10, 1], bottom: [11, 0, 10, 1],
            right: [0, 1, 1, 16], front: [1, 1, 10, 16],
            left: [11, 1, 1, 16], back: [12, 1, 10, 16]
          };

          const capeGroup = new THREE.Group();
          const capeGeo = new THREE.BoxGeometry(10, 16, 1);
          const capeMats = [
            createFaceMaterial(capeUv.left[0], capeUv.left[1], capeUv.left[2], capeUv.left[3], false, false, capeTexture),
            createFaceMaterial(capeUv.right[0], capeUv.right[1], capeUv.right[2], capeUv.right[3], false, false, capeTexture),
            createFaceMaterial(capeUv.top[0], capeUv.top[1], capeUv.top[2], capeUv.top[3], false, true, capeTexture),
            createFaceMaterial(capeUv.bottom[0], capeUv.bottom[1], capeUv.bottom[2], capeUv.bottom[3], false, true, capeTexture),
            createFaceMaterial(capeUv.back[0], capeUv.back[1], capeUv.back[2], capeUv.back[3], false, false, capeTexture),
            createFaceMaterial(capeUv.front[0], capeUv.front[1], capeUv.front[2], capeUv.front[3], false, false, capeTexture)
          ];

          const capeMesh = new THREE.Mesh(capeGeo, capeMats);
          capeMesh.position.set(0, -8, -0.5);
          capeGroup.add(capeMesh);
          capeGroup.position.set(0, 6, -2.35);
          capeGroup.rotation.x = 0.15;
          playerGroup.add(capeGroup);
          capeRef.current = capeGroup;
        });
      }

      playerGroup.rotation.y = -0.3;
      requestRenderRef.current?.();
    });

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const delta = (e.clientX - previousMousePosition.x) * 0.01;
        playerGroup.rotation.y += delta;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        requestRenderRef.current?.();
      }
    };

    requestRenderRef.current = () => renderer.render(scene, camera);
    requestRenderRef.current();
    renderer.domElement.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
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
      overlaysRef.current = [];
      capeRef.current = null;
      requestRenderRef.current = null;
    };
  }, [skinUrl, capeUrl]);

  useEffect(() => {
    overlaysRef.current.forEach(overlay => {
      overlay.visible = showLayers;
    });
    requestRenderRef.current?.();
  }, [showLayers]);

  useEffect(() => {
    if (!isFocusedSection) {
      setFocusIndex(legacyMode ? 1 : 0);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'ArrowRight') {
        if (legacyMode) onNavigateRight();
        else if (focusIndex === 4) onNavigateRight();
        else if (focusIndex >= 1 && focusIndex < 4) setFocusIndex(prev => prev + 1);
      } else if (e.key === 'ArrowLeft') {
        if (legacyMode) return;
        if (focusIndex > 1 && focusIndex <= 4) setFocusIndex(prev => prev - 1);
      } else if (e.key === 'ArrowDown') {
        if (legacyMode) {
          setFocusIndex(prev => (prev < 4 ? prev + 1 : prev));
        } else {
          setFocusIndex(prev => (prev < 4 ? prev + 1 : prev));
        }
      } else if (e.key === 'ArrowUp') {
        if (legacyMode) {
          return;
        } else {
          setFocusIndex(prev => (prev > 0 ? prev - 1 : prev));
        }
      } else if (e.key === 'Enter') {
        if (focusIndex === 0) {
          (containerRef.current?.querySelector('input') as HTMLElement)?.focus();
        } else if (focusIndex === 1) {
          playPressSound();
          setActiveView('skins');
        } else if (focusIndex === 2) {
          playPressSound();
          setShowLayers(!showLayers);
        } else if (focusIndex === 3) {
          playPressSound();
          setSkinUrl('/images/Default.png');
        } else if (focusIndex === 4) {
          playPressSound();
          setActiveView('screenshots');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusedSection, focusIndex, onNavigateRight, playPressSound, setActiveView, setShowLayers, showLayers, setSkinUrl, legacyMode]);

  useEffect(() => {
    if (isFocusedSection) {
      const el = containerRef.current?.querySelector(`[data-focus="${focusIndex}"]`) as HTMLElement;
      if (el && document.activeElement?.tagName !== 'INPUT') el.focus();
    }
  }, [isFocusedSection, focusIndex]);

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className={`absolute ${legacyMode ? 'left-[calc(50vw-340px)]' : 'left-16'} ${legacyMode ? 'top-1/2' : 'top-[40%]'} -translate-y-1/2 flex flex-col items-center gap-1 outline-none z-10`}
    >
      {!legacyMode && (
        <div className={`relative z-20 bg-black/20 flex justify-center items-center ${legacyMode ? 'mb-0' : 'mb-2'} px-2 py-1 rounded-sm border-2 transition-colors ${isFocusedSection && focusIndex === 0 ? 'border-[#ffff00]' : 'border-transparent'}`} data-focus="0" tabIndex={0}>
          <input
            type="text" value={username} maxLength={16}
            style={{ width: `${Math.max(username.length, 3) + 2}ch` }}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                e.stopPropagation();
              }
            }}
            className="bg-transparent text-white focus:text-[#ffff00] outline-none border-none text-center font-['Mojangles'] mc-text-shadow tracking-widest text-xl cursor-text"
          />
        </div>
      )}
      {!legacyMode && (
        <div className="w-[220px] h-[380px] relative flex items-center justify-center">
          <div ref={mountRef} className="absolute drop-shadow-[0_8px_8px_rgba(0,0,0,0.8)] cursor-ew-resize outline-none w-[260px] h-[450px] -translate-y-6" />
        </div>
      )}
      <div className={`flex ${legacyMode ? 'flex-col gap-2 mt-0' : 'flex-row gap-4 mt-2'} items-center`}>
        <button
          data-focus="1" tabIndex={0}
          onMouseEnter={() => isFocusedSection && setFocusIndex(1)}
          onClick={() => { playPressSound(); setActiveView('skins'); }}
          className={`mc-sq-btn w-12 h-12 flex items-center justify-center outline-none border-none transition-all ${isFocusedSection && focusIndex === 1 ? 'scale-110' : ''}`}
          style={isFocusedSection && focusIndex === 1 ? { backgroundImage: "url('/images/Button_Square_Highlighted.png')" } : {}}
          title="Change Skin"
        >
          <img src="/images/Change_Skin_Icon.png" alt="Skin" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
        </button>
        {!legacyMode && (
          <button
            data-focus="2" tabIndex={0}
            onMouseEnter={() => isFocusedSection && setFocusIndex(2)}
            onClick={() => { playPressSound(); setShowLayers(!showLayers); }}
            className={`mc-sq-btn w-12 h-12 flex items-center justify-center outline-none border-none transition-all ${isFocusedSection && focusIndex === 2 ? 'scale-110' : ''}`}
            style={isFocusedSection && focusIndex === 2 ? { backgroundImage: "url('/images/Button_Square_Highlighted.png')" } : {}}
            title="Toggle Layers"
          >
            <img src="/images/Layer_Icon.png" alt="Layers" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
          </button>
        )}
        {!legacyMode && (
          <button
            data-focus="3" tabIndex={0}
            onMouseEnter={() => isFocusedSection && setFocusIndex(3)}
            onClick={() => { playPressSound(); setSkinUrl('/images/Default.png'); }}
            className={`mc-sq-btn w-12 h-12 flex items-center justify-center outline-none border-none transition-all ${isFocusedSection && focusIndex === 3 ? 'scale-110' : ''}`}
            style={isFocusedSection && focusIndex === 3 ? { backgroundImage: "url('/images/Button_Square_Highlighted.png')" } : {}}
            title="Reset to Default"
          >
            <img src="/images/Trash_Bin_Icon.png" alt="Delete" className="w-8 h-8 object-contain brightness-200" style={{ imageRendering: 'pixelated' }} />
          </button>
        )}
        <button
          data-focus="4" tabIndex={0}
          onMouseEnter={() => isFocusedSection && setFocusIndex(4)}
          onClick={() => { playPressSound(); setActiveView('screenshots'); }}
          className={`mc-sq-btn w-12 h-12 flex items-center justify-center outline-none border-none transition-all ${isFocusedSection && focusIndex === 4 ? 'scale-110' : ''}`}
          style={isFocusedSection && focusIndex === 4 ? { backgroundImage: "url('/images/Button_Square_Highlighted.png')" } : {}}
          title="Screenshots"
        >
          <img src="/images/Screenshots_Icon.png" alt="Screenshots" className="w-8 h-8 object-contain" style={{ imageRendering: 'pixelated' }} />
        </button>
      </div>
    </motion.div>
  );
});

export default SkinViewer;