import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  TauriService,
  type GoldMapperMapping,
} from "../../services/TauriService";
import { useUI, useConfig, useAudio } from "../../context/LauncherContext";
const KEY_FALLBACK = [
  "KEY_A",
  "KEY_D",
  "KEY_S",
  "KEY_W",
  "KEY_SPACE",
  "KEY_RETURN",
  "KEY_ESCAPE",
  "KEY_LSHIFT",
  "KEY_LCTRL",
];

const MOUSE_IDS = ["MOUSE_LEFT", "MOUSE_MIDDLE", "MOUSE_RIGHT"];
const MOUSE_LABELS: Record<string, string> = {
  MOUSE_LEFT: "Left Click",
  MOUSE_MIDDLE: "Middle Click",
  MOUSE_RIGHT: "Right Click",
};

const CONTROLLER_FALLBACK = [
  "PAD_A",
  "PAD_B",
  "PAD_X",
  "PAD_Y",
  "PAD_LB",
  "PAD_RB",
  "PAD_BACK",
  "PAD_START",
  "PAD_LTHUMB",
  "PAD_RTHUMB",
  "PAD_DPAD_UP",
  "PAD_DPAD_DOWN",
  "PAD_DPAD_LEFT",
  "PAD_DPAD_RIGHT",
];

const DINPUT_ROWS: GoldMapperMapping[] = CONTROLLER_FALLBACK.map(
  (target, i) => ({ from: `DINPUT_${i}`, to: target }),
);

const displayName = (id: string) =>
  id.replace(/^(KEY|PAD)_/, "").replace(/_/g, " ");

type Row =
  | { kind: "reset"; key: string }
  | { kind: "enable"; key: string }
  | { kind: "header"; key: string; label: string }
  | { kind: "bind"; key: string; id: string; label: string };

const stoneButtonStyle = (highlighted: boolean) => ({
  backgroundImage: highlighted
    ? "url('/images/button_highlighted.png')"
    : "url('/images/Button_Background.png')",
  backgroundSize: "100% 100%",
  imageRendering: "pixelated" as const,
});

const GoldMapperView = memo(function GoldMapperView() {
  const { setActiveView } = useUI();
  const { animationsEnabled, goldmapperEnabled, setGoldmapperEnabled } =
    useConfig();
  const { playPressSound, playBackSound } = useAudio();
  const [keyboardIds, setKeyboardIds] = useState<string[]>(KEY_FALLBACK);
  const [controllerIds, setControllerIds] =
    useState<string[]>(CONTROLLER_FALLBACK);
  const [binds, setBinds] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [modalFocusIndex, setModalFocusIndex] = useState(0);
  const [keyInput, setKeyInput] = useState("");
  const [keyInputError, setKeyInputError] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    TauriService.goldMapperGetDefaults()
      .then((defaults) => {
        setKeyboardIds(
          defaults.filter((m) => m.from.startsWith("KEY_")).map((m) => m.from),
        );
        setControllerIds(
          Array.from(
            new Set(
              defaults
                .filter((m) => m.from.startsWith("DINPUT_"))
                .map((m) => m.to),
            ),
          ),
        );
      })
      .catch(console.error);
    TauriService.goldMapperLoadConfig()
      .then((rows) => {
        const loaded: Record<string, string> = {};
        for (const m of rows) {
          if (/^(KEY|MOUSE|PAD)_/.test(m.from)) {
            loaded[m.from] = m.to;
          }
        }
        setBinds(loaded);
      })
      .catch(console.error);
  }, []);

  const getTo = useCallback((id: string) => binds[id] ?? id, [binds]);
  const buildPayload = useCallback(
    (nextBinds: Record<string, string>): GoldMapperMapping[] => {
      const rows: GoldMapperMapping[] = [];
      for (const id of [...keyboardIds, ...MOUSE_IDS, ...controllerIds]) {
        const to = nextBinds[id] ?? id;
        if (to !== id) {
          rows.push({ from: id, to });
        }
      }
      rows.push(...DINPUT_ROWS);
      return rows;
    },
    [keyboardIds, controllerIds],
  );

  const handleResetToDefaults = useCallback(() => {
    playPressSound();
    setBinds({});
    console.log("[GoldMapper] reset to defaults");
    TauriService.goldMapperResetConfig().catch(console.error);
  }, [playPressSound]);

  const handleToggleEnabled = useCallback(() => {
    playPressSound();
    setGoldmapperEnabled(!goldmapperEnabled);
  }, [playPressSound, goldmapperEnabled, setGoldmapperEnabled]);

  const handleBack = useCallback(() => {
    playBackSound();
    setActiveView("settings");
  }, [playBackSound, setActiveView]);

  const openBind = useCallback(
    (id: string) => {
      playPressSound();
      setEditing(id);
      setModalFocusIndex(0);
      setKeyInput(/^KEY_/.test(getTo(id)) ? displayName(getTo(id)) : "");
      setKeyInputError(null);
    },
    [playPressSound, getTo],
  );

  const closeModal = useCallback(() => {
    playBackSound();
    (document.activeElement as HTMLElement | null)?.blur();
    setEditing(null);
  }, [playBackSound]);

  const pickTarget = useCallback(
    (sourceId: string, targetId: string) => {
      playPressSound();
      const next = { ...binds, [sourceId]: targetId };
      setBinds(next);
      const payload = buildPayload(next);
      console.log(
        "[GoldMapper] saving config:",
        JSON.stringify({ mappings: payload }),
      );
      TauriService.goldMapperSaveConfig(payload).catch(console.error);
      (document.activeElement as HTMLElement | null)?.blur();
      setEditing(null);
    },
    [playPressSound, binds, buildPayload],
  );

  const submitKeyInput = useCallback(() => {
    if (editing === null) return;
    const norm = keyInput
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/^KEY_/, "");
    if (!norm || !keyboardIds.includes(`KEY_${norm}`)) {
      setKeyInputError("Unknown key name");
      return;
    }
    pickTarget(editing, `KEY_${norm}`);
  }, [editing, keyInput, keyboardIds, pickTarget]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [{ kind: "reset", key: "reset" }];
    list.push({ kind: "enable", key: "enable" });
    list.push({
      kind: "header",
      key: "controller_header",
      label: "Controller",
    });
    for (const id of controllerIds) {
      list.push({
        kind: "bind",
        key: `controller_${id}`,
        id,
        label: displayName(id),
      });
    }
    list.push({ kind: "header", key: "mouse_header", label: "Mouse" });
    for (const id of MOUSE_IDS) {
      list.push({
        kind: "bind",
        key: `mouse_${id}`,
        id,
        label: MOUSE_LABELS[id],
      });
    }
    list.push({ kind: "header", key: "keyboard_header", label: "Keyboard" });
    for (const id of keyboardIds) {
      list.push({
        kind: "bind",
        key: `keyboard_${id}`,
        id,
        label: displayName(id),
      });
    }
    return list;
  }, [controllerIds, keyboardIds]);

  const focusableCount = rows.filter((r) => r.kind !== "header").length;
  const modalItemCount = MOUSE_IDS.length + controllerIds.length + 2;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editing !== null) {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === "INPUT") {
          if (e.key === "Escape") {
            closeModal();
          }
          return;
        }
        if (e.key === "Escape") {
          closeModal();
          return;
        }
        if (e.key === "ArrowDown" || e.key === "Tab") {
          e.preventDefault();
          setModalFocusIndex((prev) => (prev + 1) % modalItemCount);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setModalFocusIndex(
            (prev) => (prev - 1 + modalItemCount) % modalItemCount,
          );
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (modalFocusIndex < MOUSE_IDS.length + controllerIds.length) {
            const allTargets = [...MOUSE_IDS, ...controllerIds];
            pickTarget(editing, allTargets[modalFocusIndex]);
          } else if (
            modalFocusIndex ===
            MOUSE_IDS.length + controllerIds.length
          ) {
            submitKeyInput();
          } else {
            closeModal();
          }
        }
        return;
      }
      if (e.key === "Escape") {
        handleBack();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((prev) =>
          prev === null || prev >= focusableCount - 1 ? 0 : prev + 1,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) =>
          prev === null || prev <= 0 ? focusableCount - 1 : prev - 1,
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    focusableCount,
    handleBack,
    editing,
    closeModal,
    modalItemCount,
    modalFocusIndex,
    controllerIds.length,
    pickTarget,
    submitKeyInput,
  ]);

  useEffect(() => {
    if (focusIndex === null || editing !== null) return;
    const el = containerRef.current?.querySelector(
      `[data-focus-index="${focusIndex}"]`,
    ) as HTMLElement | null;
    el?.focus();
  }, [focusIndex, editing]);

  useEffect(() => {
    if (editing === null) return;
    const el = document.querySelector(
      `[data-modal-index="${modalFocusIndex}"]`,
    ) as HTMLElement | null;
    el?.focus();
  }, [modalFocusIndex, editing]);

  let focusCounter = 0;
  const nextFocusIndex = () => {
    const idx = focusCounter;
    focusCounter += 1;
    return idx;
  };

  const renderRow = (row: Row) => {
    if (row.kind === "header") {
      return (
        <div key={row.key} className="w-full px-1 pt-3 pb-1">
          <span className="text-sm text-black tracking-widest">
            {row.label}
          </span>
        </div>
      );
    }

    const isReset = row.kind === "reset";
    const isEnable = row.kind === "enable";
    const focusIdx = nextFocusIndex();
    const focused = focusIndex === focusIdx;
    return (
      <button
        key={row.key}
        data-focus-index={focusIdx}
        onFocus={() => setFocusIndex(focusIdx)}
        onMouseEnter={() => setFocusIndex(focusIdx)}
        onClick={
          isReset
            ? handleResetToDefaults
            : isEnable
              ? handleToggleEnabled
              : () => openBind(row.id)
        }
        className={`w-full h-10 flex items-center pl-6 pr-4 outline-none border-none shrink-0 transition-colors ${
          focused
            ? "text-[#ffff00]"
            : isEnable
              ? "text-[#333333]"
              : "text-white"
        } ${isReset ? "justify-center hover:text-[#ffff00]" : ""}`}
        style={isEnable ? undefined : stoneButtonStyle(focused)}
      >
        {isEnable && (
          <div className="relative w-6 h-6 mr-3 shrink-0 flex items-center justify-center">
            <img
              src={
                focused
                  ? "/images/checkbox_highlighted.png"
                  : "/images/checkbox.png"
              }
              alt="checkbox"
              className="absolute inset-0 w-full h-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            {goldmapperEnabled && (
              <img
                src="/images/check.png"
                alt="checked"
                className="relative z-10 w-6 h-6 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            )}
          </div>
        )}
        <span
          className={`tracking-widest text-lg mc-text-shadow truncate ${
            isReset ? "" : "flex-1 text-left"
          }`}
        >
          {isReset
            ? "Reset to Defaults"
            : isEnable
              ? "Enable GoldMapper"
              : row.label}
        </span>
        {!isReset && !isEnable && row.kind === "bind" && (
          <span className="tracking-widest text-base opacity-70 ml-3 shrink-0">
            {displayName(getTo(row.id))}
          </span>
        )}
        {isEnable && (
          <img
            src="/images/goldmapper.png"
            alt=""
            className="w-6 h-6 object-contain shrink-0 ml-3"
            style={{ imageRendering: "pixelated" }}
          />
        )}
      </button>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: animationsEnabled ? 0.3 : 0 }}
      className="flex flex-col items-center w-full max-w-5xl"
    >
      <div
        ref={containerRef}
        className="w-[720px] max-w-[92vw] h-[560px] max-h-[62vh] p-4 flex flex-col gap-2 overflow-y-auto settings-scrollbar mc-options-bg"
      >
        {rows.map(renderRow)}
      </div>

      <button
        onMouseEnter={() => setFocusIndex(null)}
        onClick={handleBack}
        className="w-40 h-10 flex items-center justify-center transition-colors text-xl mc-text-shadow outline-none border-none hover:text-[#ffff00] mt-4 text-white"
        style={{
          backgroundImage: "url('/images/Button_Background.png')",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
        }}
      >
        Back
      </button>

      {editing !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 outline-none border-none"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="relative w-[620px] max-w-[95vw] h-[580px] max-h-[88vh] p-5 flex flex-col font-['Mojangles'] mc-options-bg">
            <h2 className="text-xl text-black mc-text-shadow mb-4 text-center">
              Assign {displayName(editing)}
            </h2>

            <div className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar mb-4">
              <div className="mb-3">
                <h3 className="text-[#333333] mc-text-shadow uppercase tracking-widest text-sm px-3 pt-2 pb-1">
                  Mouse
                </h3>
                <div className="grid grid-cols-4 gap-2 p-1 content-start">
                  {MOUSE_IDS.map((id, i) => (
                    <button
                      key={id}
                      data-modal-index={i}
                      onFocus={() => setModalFocusIndex(i)}
                      onMouseEnter={() => setModalFocusIndex(i)}
                      onClick={() => pickTarget(editing, id)}
                      className={`h-10 px-2 flex items-center justify-center text-sm tracking-widest outline-none border-none cursor-pointer transition-colors ${
                        getTo(editing) === id ? "text-[#ffff00]" : "text-white"
                      }`}
                      style={stoneButtonStyle(modalFocusIndex === i)}
                    >
                      <span className="truncate">{MOUSE_LABELS[id]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <h3 className="text-[#333333] mc-text-shadow uppercase tracking-widest text-sm px-3 pt-2 pb-1">
                  Controller
                </h3>
                <div className="grid grid-cols-4 gap-2 p-1 content-start">
                  {controllerIds.map((id, i) => {
                    const idx = MOUSE_IDS.length + i;
                    return (
                      <button
                        key={id}
                        data-modal-index={idx}
                        onFocus={() => setModalFocusIndex(idx)}
                        onMouseEnter={() => setModalFocusIndex(idx)}
                        onClick={() => pickTarget(editing, id)}
                        className={`h-10 px-2 flex items-center justify-center text-sm tracking-widest outline-none border-none cursor-pointer transition-colors ${
                          getTo(editing) === id
                            ? "text-[#ffff00]"
                            : "text-white"
                        }`}
                        style={stoneButtonStyle(modalFocusIndex === idx)}
                      >
                        <span className="truncate">{displayName(id)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-3">
                <h3 className="text-[#333333] mc-text-shadow uppercase tracking-widest text-sm px-3 pt-2 pb-1">
                  Keyboard
                </h3>
                <input
                  data-modal-index={MOUSE_IDS.length + controllerIds.length}
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setKeyInputError(null);
                  }}
                  onFocus={() =>
                    setModalFocusIndex(MOUSE_IDS.length + controllerIds.length)
                  }
                  onMouseEnter={() =>
                    setModalFocusIndex(MOUSE_IDS.length + controllerIds.length)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitKeyInput();
                  }}
                  placeholder="Type a key name and press Enter"
                  className={`w-full h-10 px-3 bg-black/40 border-2 text-white text-base outline-none text-center ${
                    keyInputError
                      ? "border-red-600"
                      : "border-[#373737] focus:border-[#FFFF55]"
                  }`}
                  style={{ imageRendering: "pixelated" }}
                />
                {keyInputError && (
                  <p className="text-red-600 text-xs mt-1 px-3">
                    {keyInputError}
                  </p>
                )}
              </div>
            </div>

            <button
              data-modal-index={MOUSE_IDS.length + controllerIds.length + 1}
              onFocus={() =>
                setModalFocusIndex(MOUSE_IDS.length + controllerIds.length + 1)
              }
              onMouseEnter={() =>
                setModalFocusIndex(MOUSE_IDS.length + controllerIds.length + 1)
              }
              onClick={closeModal}
              className={`w-full h-12 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none cursor-pointer ${
                modalFocusIndex === MOUSE_IDS.length + controllerIds.length + 1
                  ? "text-[#ffff00]"
                  : "text-white"
              }`}
              style={{
                backgroundImage:
                  modalFocusIndex ===
                  MOUSE_IDS.length + controllerIds.length + 1
                    ? "url('/images/button_highlighted.png')"
                    : "url('/images/Button_Background.png')",
                backgroundSize: "100% 100%",
                imageRendering: "pixelated",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
});

export default GoldMapperView;
