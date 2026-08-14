export type OptionType = "boolean" | "int" | "number" | "string" | "choice";
export interface SchemaChoice {
  value: string;
  label?: string;
}

export interface SchemaOption {
  id: string;
  title: string;
  type: OptionType;
  arg: string;
  description?: string;
  group?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  choices?: SchemaChoice[];
}

export interface SchemaGroup {
  id: string;
  title: string;
  description?: string;
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | {
      option: string;
      equals?: unknown;
      in?: unknown[];
      not?: unknown;
      exists?: boolean;
    };

export interface SchemaDependency {
  target: string;
  when: Condition;
  effect?: "disable" | "hide";
}

export interface ArgsSchema {
  $schema: string;
  schemaVersion?: number;
  meta?: Record<string, unknown>;
  groups: SchemaGroup[];
  options: SchemaOption[];
  dependencies: SchemaDependency[];
}

export interface OptionEffects {
  hidden: boolean;
  disabled: boolean;
}

const VALID_TYPES: OptionType[] = [
  "boolean",
  "int",
  "number",
  "string",
  "choice",
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCondition(value: unknown): value is Condition {
  if (!isObject(value)) return false;
  if ("option" in value) return typeof value.option === "string";
  if ("all" in value)
    return Array.isArray(value.all) && value.all.every(isCondition);
  if ("any" in value)
    return Array.isArray(value.any) && value.any.every(isCondition);
  if ("not" in value) return isCondition(value.not);
  return false;
}
export function parseSchema(raw: string): ArgsSchema | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  if (parsed.$schema === undefined) return null; //neo: cheap. i know.
  if (!Array.isArray(parsed.options)) return null;
  const optionKeys = new Set<string>();
  const options: SchemaOption[] = [];
  for (const entry of parsed.options) {
    if (!isObject(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id : "";
    const title = typeof entry.title === "string" ? entry.title : "";
    const type = entry.type;
    const arg = typeof entry.arg === "string" ? entry.arg : "";
    if (!id || !title || !arg || optionKeys.has(id)) continue;
    if (typeof type !== "string" || !VALID_TYPES.includes(type as OptionType))
      continue;
    if (type === "choice") {
      if (!Array.isArray(entry.choices) || entry.choices.length === 0) continue;
      const choices: SchemaChoice[] = [];
      const seen = new Set<string>();
      for (const c of entry.choices) {
        if (!isObject(c) || typeof c.value !== "string" || seen.has(c.value))
          continue;
        seen.add(c.value);
        choices.push({
          value: c.value,
          label: typeof c.label === "string" ? c.label : c.value,
        });
      }
      if (choices.length === 0) continue;
      options.push({
        id,
        title,
        type: "choice",
        arg,
        description:
          typeof entry.description === "string" ? entry.description : undefined,
        group: typeof entry.group === "string" ? entry.group : undefined,
        default: typeof entry.default === "string" ? entry.default : undefined,
        choices,
      });
      continue;
    }
    const option: SchemaOption = {
      id,
      title,
      type: type as OptionType,
      arg,
      description:
        typeof entry.description === "string" ? entry.description : undefined,
      group: typeof entry.group === "string" ? entry.group : undefined,
    };
    if (entry.default !== undefined) option.default = entry.default;
    if (isFiniteNumber(entry.min)) option.min = entry.min;
    if (isFiniteNumber(entry.max)) option.max = entry.max;
    if (isFiniteNumber(entry.step)) option.step = entry.step;
    if (typeof entry.placeholder === "string")
      option.placeholder = entry.placeholder;
    options.push(option);
  }

  const groups: SchemaGroup[] = [];
  if (Array.isArray(parsed.groups)) {
    const seen = new Set<string>();
    for (const g of parsed.groups) {
      if (!isObject(g) || typeof g.id !== "string" || seen.has(g.id)) continue;
      seen.add(g.id);
      groups.push({
        id: g.id,
        title: typeof g.title === "string" ? g.title : g.id,
        description:
          typeof g.description === "string" ? g.description : undefined,
      });
    }
  }

  const dependencies: SchemaDependency[] = [];
  if (Array.isArray(parsed.dependencies)) {
    for (const d of parsed.dependencies) {
      if (!isObject(d) || typeof d.target !== "string") continue;
      if (!isCondition(d.when)) continue;
      dependencies.push({
        target: d.target,
        when: d.when,
        effect:
          d.effect === "hide" || d.effect === "disable" ? d.effect : "disable",
      });
    }
  }

  if (options.length === 0) return null;
  return {
    $schema: parsed.$schema!.toString(),
    schemaVersion: 1,
    meta: isObject(parsed.meta) ? parsed.meta : undefined,
    groups,
    options,
    dependencies,
  };
}

export function defaultValues(schema: ArgsSchema): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const option of schema.options) {
    values[option.id] = optionDefault(option);
  }
  return values;
}

export function optionDefault(option: SchemaOption): unknown {
  switch (option.type) {
    case "boolean":
      return typeof option.default === "boolean" ? option.default : false;
    case "int":
    case "number":
      return isFiniteNumber(option.default) ? option.default : 0;
    case "string":
      return typeof option.default === "string" ? option.default : "";
    case "choice": {
      if (typeof option.default === "string") {
        const match = option.choices?.find((c) => c.value === option.default);
        if (match) return match.value;
      }
      return option.choices?.[0]?.value ?? "";
    }
  }
}

export function sanitizeValue(option: SchemaOption, value: unknown): unknown {
  switch (option.type) {
    case "boolean":
      return typeof value === "boolean" ? value : optionDefault(option);
    case "int":
      return isFiniteNumber(value) ? Math.trunc(value) : optionDefault(option);
    case "number":
      return isFiniteNumber(value) ? value : optionDefault(option);
    case "string":
      return typeof value === "string" ? value : optionDefault(option);
    case "choice": {
      if (
        typeof value === "string" &&
        option.choices?.some((c) => c.value === value)
      ) {
        return value;
      }
      return optionDefault(option);
    }
  }
}

export function mergeValues(
  schema: ArgsSchema,
  saved: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const values = defaultValues(schema);
  if (!saved) return values;
  for (const option of schema.options) {
    if (saved[option.id] !== undefined) {
      values[option.id] = sanitizeValue(option, saved[option.id]);
    }
  }
  return values;
}

function evaluateLeaf(
  condition: Record<string, unknown>,
  values: Record<string, unknown>,
): boolean {
  const optionId = typeof condition.option === "string" ? condition.option : "";
  const value = optionId in values ? values[optionId] : undefined;
  if (condition.equals !== undefined) return value === condition.equals;
  if (Array.isArray(condition.in)) {
    return condition.in.some((candidate) => candidate === value);
  }
  if (condition.not !== undefined) return value !== condition.not;
  if (condition.exists !== undefined) {
    return condition.exists
      ? value !== undefined && value !== null && value !== "" && value !== false
      : value === undefined ||
          value === null ||
          value === "" ||
          value === false;
  }
  return false;
}

export function evaluateCondition(
  condition: Condition,
  values: Record<string, unknown>,
): boolean {
  if ("option" in condition) return evaluateLeaf(condition, values);
  if ("all" in condition)
    return condition.all.every((c) => evaluateCondition(c, values));
  if ("any" in condition)
    return condition.any.some((c) => evaluateCondition(c, values));
  if ("not" in condition) return !evaluateCondition(condition.not, values);
  return false;
}

export function computeEffects(
  schema: ArgsSchema,
  values: Record<string, unknown>,
): Record<string, OptionEffects> {
  const effects: Record<string, OptionEffects> = {};
  for (const option of schema.options) {
    effects[option.id] = { hidden: false, disabled: false };
  }
  for (const dep of schema.dependencies) {
    if (!(dep.target in effects)) continue;
    if (!evaluateCondition(dep.when, values)) continue;
    const effect = effects[dep.target];
    if (dep.effect === "hide") {
      effect.hidden = true;
      effect.disabled = true;
    } else {
      effect.disabled = true;
    }
  }
  return effects;
}

export function buildArgs(
  schema: ArgsSchema,
  values: Record<string, unknown>,
  effects: Record<string, OptionEffects>,
): string[] {
  const args: string[] = [];
  for (const option of schema.options) {
    const effect = effects[option.id];
    if (!effect) continue;
    if (effect.hidden || effect.disabled) continue;
    const value = values[option.id];
    switch (option.type) {
      case "boolean":
        if (value === true) args.push(option.arg);
        break;
      case "int":
      case "number":
        if (isFiniteNumber(value)) args.push(option.arg, String(value));
        break;
      case "string":
        if (typeof value === "string" && value.trim() !== "") {
          args.push(option.arg, value);
        }
        break;
      case "choice":
        if (typeof value === "string" && value !== "") {
          args.push(option.arg, value);
        }
        break;
    }
  }
  return args;
}

export function displayValue(option: SchemaOption, value: unknown): string {
  switch (option.type) {
    case "boolean":
      return value === true ? "true" : "false";
    case "int":
    case "number":
      return isFiniteNumber(value) ? String(value) : "";
    case "string":
      return typeof value === "string" ? value : "";
    case "choice": {
      if (typeof value !== "string") return "";
      return option.choices?.find((c) => c.value === value)?.label ?? value;
    }
  }
}
