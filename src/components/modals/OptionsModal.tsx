import { useState, useEffect, useMemo, useRef, type RefObject } from "react";
import { TauriService } from "../../services/TauriService";
import {
  parseSchema,
  mergeValues,
  defaultValues,
  computeEffects,
  buildArgs,
  type ArgsSchema,
  type SchemaOption,
} from "../../utils/argsSchema";

export default function OptionsModal({
  isOpen,
  onClose,
  playPressSound,
  playBackSound,
  instanceId,
  instanceName,
  savedValues,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  playPressSound: (s?: string) => void;
  playBackSound: (s?: string) => void;
  instanceId: string;
  instanceName: string;
  savedValues?: Record<string, unknown>;
  onSave: (
    instanceId: string,
    values: Record<string, unknown>,
    args: string[],
  ) => void;
}) {
  const [schema, setSchema] = useState<ArgsSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const inputRefs = useRef<(HTMLElement | null)[]>([]);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const saveRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSchema(null);
    setValues({});
    setFocusIndex(0);
    TauriService.getInstanceArgsSchema(instanceId)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setError("This instance does not provide a launch options schema.");
          setLoading(false);
          return;
        }
        const parsed = parseSchema(raw);
        if (!parsed) {
          setError("The launch options schema is invalid or unsupported.");
          setLoading(false);
          return;
        }
        setSchema(parsed);
        setValues(mergeValues(parsed, savedValues));
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, instanceId, savedValues]);

  const effects = useMemo(
    () => (schema ? computeEffects(schema, values) : {}),
    [schema, values],
  );

  const visibleOptions = useMemo(
    () =>
      schema
        ? schema.options.filter((o) => !effects[o.id]?.hidden)
        : ([] as SchemaOption[]),
    [schema, effects],
  );

  const optionOrder = useMemo(
    () => visibleOptions.map((o) => o.id),
    [visibleOptions],
  );

  useEffect(() => {
    setFocusIndex((prev) => Math.min(prev, optionOrder.length + 2));
  }, [optionOrder.length]);

  const sections = useMemo(() => {
    if (!schema)
      return {
        sections: [] as {
          title: string;
          description?: string;
          options: SchemaOption[];
        }[],
        general: [] as SchemaOption[],
      };
    const byGroup = new Map<string, SchemaOption[]>();
    const general: SchemaOption[] = [];
    const declared = new Set(schema.groups.map((g) => g.id));
    for (const option of visibleOptions) {
      if (option.group && declared.has(option.group)) {
        const list = byGroup.get(option.group);
        if (list) list.push(option);
        else byGroup.set(option.group, [option]);
      } else {
        general.push(option);
      }
    }
    const sections = schema.groups
      .map((group) => ({
        title: group.title,
        description: group.description,
        options: byGroup.get(group.id) ?? ([] as SchemaOption[]),
      }))
      .filter((s) => s.options.length > 0);
    return { sections, general };
  }, [schema, visibleOptions]);

  const handleReset = () => {
    playPressSound();
    if (!schema) return;
    setValues(defaultValues(schema));
  };

  const handleSave = () => {
    if (!schema) return;
    playPressSound("save_click.wav");
    const finalValues = { ...values };
    onSave(
      instanceId,
      finalValues,
      buildArgs(schema, finalValues, computeEffects(schema, finalValues)),
    );
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag === "INPUT" ||
        activeTag === "SELECT" ||
        activeTag === "TEXTAREA"
      ) {
        if (e.key === "Escape") {
          playBackSound();
          onClose();
        }
        return;
      }
      const total = optionOrder.length + 3;
      if (e.key === "Escape") {
        playBackSound();
        onClose();
      } else if (e.key === "ArrowDown" || e.key === "Tab") {
        e.preventDefault();
        setFocusIndex((prev) => (prev + 1) % total);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((prev) => (prev - 1 + total) % total);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex < optionOrder.length) {
          const id = optionOrder[focusIndex];
          const option = schema?.options.find((o) => o.id === id);
          if (!option) return;
          const effect = effects[id];
          if (option.type === "boolean") {
            if (!effect?.disabled) {
              setValues((prev) => ({ ...prev, [id]: !prev[id] }));
            }
          } else {
            const input = inputRefs.current[focusIndex];
            if (input) input.focus();
          }
        } else if (focusIndex === optionOrder.length) {
          handleReset();
        } else if (focusIndex === optionOrder.length + 1) {
          playBackSound();
          onClose();
        } else {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    isOpen,
    optionOrder,
    focusIndex,
    schema,
    values,
    effects,
    playPressSound,
    playBackSound,
    onClose,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    if (focusIndex < optionOrder.length) {
      rowRefs.current[focusIndex]?.focus();
    } else if (focusIndex === optionOrder.length) {
      resetRef.current?.focus();
    } else if (focusIndex === optionOrder.length + 1) {
      cancelRef.current?.focus();
    } else {
      saveRef.current?.focus();
    }
  }, [isOpen, focusIndex, optionOrder]);

  if (!isOpen) return null;

  const flatIndex = (optionId: string) => optionOrder.indexOf(optionId);
  const titleDesc = (option: SchemaOption) => (
    <div className="flex-1 min-w-0">
      <div className="text-sm text-[#222222] mc-text-shadow truncate">
        {option.title}
      </div>
      {option.description && (
        <div className="text-[11px] text-[#666666] leading-tight">
          {option.description}
        </div>
      )}
    </div>
  );

  const control = (option: SchemaOption, index: number, disabled: boolean) => {
    const value = values[option.id];
    switch (option.type) {
      case "boolean":
        return null;
      case "int":
      case "number":
        return (
          <input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="number"
            disabled={disabled}
            min={option.min}
            max={option.max}
            step={option.step ?? (option.type === "int" ? 1 : "any")}
            value={typeof value === "number" ? value : ""}
            onChange={(e) => {
              const raw = e.target.value;
              setValues((prev) => ({
                ...prev,
                [option.id]: raw === "" ? "" : Number(raw),
              }));
            }}
            onFocus={() => setFocusIndex(index)}
            className={`w-24 h-8 bg-black/40 border-2 border-[#373737] text-white text-sm px-2 outline-none text-center font-['Mojangles'] focus:border-[#FFFF55] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              disabled ? "opacity-40 cursor-not-allowed" : ""
            }`}
            style={{ imageRendering: "pixelated" }}
          />
        );
      case "string":
        return (
          <input
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            disabled={disabled}
            placeholder={option.placeholder}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => {
              setValues((prev) => ({ ...prev, [option.id]: e.target.value }));
            }}
            onFocus={() => setFocusIndex(index)}
            className={`w-44 h-8 bg-black/40 border-2 border-[#373737] text-white text-sm px-2 outline-none font-['Mojangles'] focus:border-[#FFFF55] ${
              disabled ? "opacity-40 cursor-not-allowed" : ""
            }`}
            style={{ imageRendering: "pixelated" }}
          />
        );
      case "choice":
        return (
          <select
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            disabled={disabled}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => {
              setValues((prev) => ({ ...prev, [option.id]: e.target.value }));
            }}
            onFocus={() => setFocusIndex(index)}
            className={`w-44 h-8 bg-white border-2 border-[#373737] text-black text-sm px-2 outline-none font-['Mojangles'] focus:border-[#FFFF55] ${
              disabled ? "opacity-40 cursor-not-allowed" : ""
            }`}
            style={{ imageRendering: "pixelated" }}
          >
            {option.choices?.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label ?? choice.value}
              </option>
            ))}
          </select>
        );
    }
  };

  const renderOption = (option: SchemaOption) => {
    const index = flatIndex(option.id);
    const effect = effects[option.id];
    const disabled = !!effect?.disabled;
    const isFocused = focusIndex === index;
    if (option.type === "boolean") {
      return (
        <button
          key={option.id}
          ref={(el) => {
            rowRefs.current[index] = el;
            inputRefs.current[index] = null;
          }}
          onFocus={() => setFocusIndex(index)}
          onClick={() => {
            if (disabled) return;
            playPressSound();
            setValues((prev) => ({ ...prev, [option.id]: !prev[option.id] }));
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 text-left outline-none border-2 ${
            isFocused ? "border-[#FFFF55] bg-black/10" : "border-transparent"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="relative w-6 h-6 flex-shrink-0 flex items-center justify-center">
            <img
              src={
                isFocused
                  ? "/images/checkbox_highlighted.png"
                  : "/images/checkbox.png"
              }
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              style={{ imageRendering: "pixelated" }}
            />
            {values[option.id] === true && (
              <img
                src="/images/check.png"
                alt=""
                className="relative z-10 w-6 h-6 object-contain"
                style={{ imageRendering: "pixelated" }}
              />
            )}
          </div>
          {titleDesc(option)}
        </button>
      );
    }
    return (
      <div
        key={option.id}
        ref={(el) => {
          rowRefs.current[index] = el;
        }}
        tabIndex={-1}
        className={`w-full flex items-center gap-3 px-3 py-2 outline-none border-2 ${
          isFocused ? "border-[#FFFF55] bg-black/10" : "border-transparent"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {control(option, index, disabled)}
          {titleDesc(option)}
        </div>
      </div>
    );
  };

  const actionButton = (
    ref: RefObject<HTMLButtonElement | null>,
    index: number,
    label: string,
    onClick: () => void,
    danger?: boolean,
  ) => (
    <button
      ref={ref}
      onMouseEnter={() => setFocusIndex(index)}
      onClick={onClick}
      className={`flex-1 h-12 flex items-center justify-center text-xl mc-text-shadow transition-colors outline-none border-none bg-transparent ${
        focusIndex === index
          ? "text-[#FFFF55]"
          : danger
            ? "text-red-500"
            : "text-white"
      }`}
      style={{
        backgroundImage:
          focusIndex === index
            ? "url('/images/button_highlighted.png')"
            : "url('/images/Button_Background.png')",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 outline-none border-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          playBackSound();
          onClose();
        }
      }}
    >
      <div className="relative w-[620px] max-w-[95vw] max-h-[88vh] p-5 flex flex-col items-center font-['Mojangles'] mc-options-bg">
        <h2 className="text-xl text-black mc-text-shadow mb-1 text-center">
          Options
        </h2>
        <p className="text-[#333333] text-sm mb-4 text-center truncate max-w-full">
          {instanceName}
        </p>

        {loading ? (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-12 h-12 border-4 border-[#FFFF55] border-t-transparent rounded-full animate-spin" />
            <p className="text-black text-lg mc-text-shadow">
              Loading options...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-red-600 text-sm mc-text-shadow text-center max-w-md">
              {error}
            </p>
            <div className="flex gap-4 mt-2 w-full">
              {actionButton(cancelRef, optionOrder.length + 1, "OK", () => {
                playBackSound();
                onClose();
              })}
            </div>
          </div>
        ) : schema ? (
          <>
            <div className="w-full flex-1 min-h-0 max-h-[52vh] overflow-y-auto custom-scrollbar mb-4">
              {sections.sections.map((section) => (
                <div key={section.title} className="mb-3">
                  <h3 className="text-[#333333] mc-text-shadow uppercase tracking-widest text-sm px-3 pt-2 pb-1">
                    {section.title}
                  </h3>
                  {section.description && (
                    <p className="text-[#666666] text-xs px-3 pb-1">
                      {section.description}
                    </p>
                  )}
                  {section.options.map(renderOption)}
                </div>
              ))}
              {sections.general.length > 0 && (
                <div className="mb-3">
                  <h3 className="text-[#333333] mc-text-shadow uppercase tracking-widest text-sm px-3 pt-2 pb-1">
                    General
                  </h3>
                  {sections.general.map(renderOption)}
                </div>
              )}
            </div>

            <div className="flex gap-4 w-full flex-shrink-0">
              {actionButton(
                resetRef,
                optionOrder.length,
                "Reset",
                handleReset,
                true,
              )}
              {actionButton(cancelRef, optionOrder.length + 1, "Cancel", () => {
                playBackSound();
                onClose();
              })}
              {actionButton(
                saveRef,
                optionOrder.length + 2,
                "Save",
                handleSave,
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
