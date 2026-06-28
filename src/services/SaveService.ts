import pako from "pako";
import type {
  NbtValue,
  NbtByte,
  NbtShort,
  NbtInt,
  NbtLong,
  NbtFloat,
  NbtDouble,
  NbtString,
  NbtList,
  NbtCompound,
  NbtFile,
  ContainerEntry,
  ParsedContainer,
  LoadedSave,
} from "../types/save";
import { TagType } from "../types/save";
const FILE_ENTRY_SIZE = 144;
const INNER_HEADER_SIZE = 12;
class NbtReader {
  private view: DataView;
  private pos = 0;
  private raw: Uint8Array;
  constructor(data: Uint8Array) {
    this.raw = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  private u8() {
    return this.view.getUint8(this.pos++);
  }
  private i8() {
    return this.view.getInt8(this.pos++);
  }
  private i16() {
    const v = this.view.getInt16(this.pos, false);
    this.pos += 2;
    return v;
  }
  private u16() {
    const v = this.view.getUint16(this.pos, false);
    this.pos += 2;
    return v;
  }
  private i32() {
    const v = this.view.getInt32(this.pos, false);
    this.pos += 4;
    return v;
  }
  private f32() {
    const v = this.view.getFloat32(this.pos, false);
    this.pos += 4;
    return v;
  }
  private f64() {
    const v = this.view.getFloat64(this.pos, false);
    this.pos += 8;
    return v;
  }

  private i64(): bigint {
    const hi = this.view.getUint32(this.pos, false);
    const lo = this.view.getUint32(this.pos + 4, false);
    this.pos += 8;
    const u = (BigInt(hi) << 32n) | BigInt(lo);
    return u >= 1n << 63n ? u - (1n << 64n) : u;
  }

  private readString(): string {
    const len = this.u16();
    const bytes = this.raw.subarray(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(bytes);
  }

  private readPayload(type: TagType): NbtValue {
    switch (type) {
      case TagType.Byte:
        return { type: TagType.Byte, value: this.i8() };
      case TagType.Short:
        return { type: TagType.Short, value: this.i16() };
      case TagType.Int:
        return { type: TagType.Int, value: this.i32() };
      case TagType.Long:
        return { type: TagType.Long, value: this.i64() };
      case TagType.Float:
        return { type: TagType.Float, value: this.f32() };
      case TagType.Double:
        return { type: TagType.Double, value: this.f64() };
      case TagType.String:
        return { type: TagType.String, value: this.readString() };
      case TagType.ByteArray: {
        const n = this.i32();
        const v = this.raw.slice(this.pos, this.pos + n);
        this.pos += n;
        return { type: TagType.ByteArray, value: v };
      }
      case TagType.IntArray: {
        const n = this.i32();
        const v = new Int32Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i32();
        return { type: TagType.IntArray, value: v };
      }
      case TagType.LongArray: {
        const n = this.i32();
        const v = new BigInt64Array(n);
        for (let i = 0; i < n; i++) v[i] = this.i64();
        return { type: TagType.LongArray, value: v };
      }
      case TagType.List: {
        const elemType = this.u8() as TagType;
        const n = this.i32();
        const items: NbtValue[] = [];
        for (let i = 0; i < n; i++) items.push(this.readPayload(elemType));
        return { type: TagType.List, elementType: elemType, items };
      }
      case TagType.Compound: {
        const tags: Record<string, NbtValue> = {};
        for (;;) {
          const tagType = this.u8() as TagType;
          if (tagType === TagType.End) break;
          const name = this.readString();
          tags[name] = this.readPayload(tagType);
        }
        return { type: TagType.Compound, tags };
      }
      default:
        throw new Error(`Unknown NBT tag type: ${type}`);
    }
  }

  readFile(): NbtFile {
    const type = this.u8() as TagType;
    if (type !== TagType.Compound)
      throw new Error(`Root tag must be Compound, got type ${type}`);
    const rootName = this.readString();
    const root = this.readPayload(TagType.Compound) as NbtCompound;
    return { rootName, root };
  }
}

class NbtWriter {
  private chunks: Uint8Array[] = [];
  private push(b: Uint8Array) {
    this.chunks.push(b);
  }

  private u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }
  private i16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setInt16(0, v, false);
    this.push(b);
  }
  private u16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, false);
    this.push(b);
  }
  private i32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setInt32(0, v, false);
    this.push(b);
  }
  private f32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, false);
    this.push(b);
  }
  private f64(v: number) {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, false);
    this.push(b);
  }

  private i64(v: bigint) {
    const b = new Uint8Array(8);
    const dv = new DataView(b.buffer);
    const u = v < 0n ? v + (1n << 64n) : v;
    dv.setUint32(0, Number(u >> 32n), false);
    dv.setUint32(4, Number(u & 0xffffffffn), false);
    this.push(b);
  }

  private writeString(v: string) {
    const enc = new TextEncoder().encode(v);
    this.u16(enc.length);
    this.push(enc);
  }

  private writePayload(value: NbtValue) {
    switch (value.type) {
      case TagType.Byte:
        this.u8(value.value & 0xff);
        break;
      case TagType.Short:
        this.i16(value.value);
        break;
      case TagType.Int:
        this.i32(value.value);
        break;
      case TagType.Long:
        this.i64(value.value);
        break;
      case TagType.Float:
        this.f32(value.value);
        break;
      case TagType.Double:
        this.f64(value.value);
        break;
      case TagType.String:
        this.writeString(value.value);
        break;
      case TagType.ByteArray: {
        this.i32(value.value.length);
        this.push(value.value);
        break;
      }
      case TagType.IntArray: {
        this.i32(value.value.length);
        const b = new Uint8Array(value.value.length * 4);
        const dv = new DataView(b.buffer);
        for (let i = 0; i < value.value.length; i++)
          dv.setInt32(i * 4, value.value[i], false);
        this.push(b);
        break;
      }
      case TagType.LongArray: {
        this.i32(value.value.length);
        for (let i = 0; i < value.value.length; i++) this.i64(value.value[i]);
        break;
      }
      case TagType.List: {
        this.u8(value.elementType);
        this.i32(value.items.length);
        for (const item of value.items) this.writePayload(item);
        break;
      }
      case TagType.Compound: {
        for (const [name, child] of Object.entries(value.tags)) {
          this.u8(child.type);
          this.writeString(name);
          this.writePayload(child);
        }
        this.u8(TagType.End);
        break;
      }
    }
  }

  writeFile(file: NbtFile): Uint8Array {
    this.u8(TagType.Compound);
    this.writeString(file.rootName);
    this.writePayload(file.root);
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of this.chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }
}

function getTag<T extends NbtValue>(
  tags: Record<string, NbtValue>,
  key: string,
  type: T["type"],
): T | undefined {
  const v = tags[key];
  return v?.type === type ? (v as T) : undefined;
}

const get = {
  byte: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtByte>(t, k, TagType.Byte)?.value,
  short: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtShort>(t, k, TagType.Short)?.value,
  int: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtInt>(t, k, TagType.Int)?.value,
  long: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtLong>(t, k, TagType.Long)?.value,
  float: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtFloat>(t, k, TagType.Float)?.value,
  double: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtDouble>(t, k, TagType.Double)?.value,
  str: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtString>(t, k, TagType.String)?.value,
  list: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtList>(t, k, TagType.List),
  compound: (t: Record<string, NbtValue>, k: string) =>
    getTag<NbtCompound>(t, k, TagType.Compound),
};

function cloneNbt(file: NbtFile): NbtFile {
  return JSON.parse(
    JSON.stringify(file, (_k, v) =>
      typeof v === "bigint" ? { __bigint__: v.toString() } : v,
    ),
    (_k, v) =>
      v && typeof v === "object" && "__bigint__" in v
        ? BigInt(v.__bigint__)
        : v,
  ) as NbtFile;
}

const nbt = {
  byte: (v: number): NbtByte => ({ type: TagType.Byte, value: v }),
  short: (v: number): NbtShort => ({ type: TagType.Short, value: v }),
  int: (v: number): NbtInt => ({ type: TagType.Int, value: v }),
  long: (v: bigint): NbtLong => ({ type: TagType.Long, value: v }),
  float: (v: number): NbtFloat => ({ type: TagType.Float, value: v }),
  str: (v: string): NbtString => ({ type: TagType.String, value: v }),
  compound: (tags: Record<string, NbtValue>): NbtCompound => ({
    type: TagType.Compound,
    tags,
  }),
  list: (elementType: TagType, items: NbtValue[]): NbtList => ({
    type: TagType.List,
    elementType,
    items,
  }),
};

function isConsoleContainer(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  return (
    dv.getUint32(0, true) === 0 &&
    dv.getUint32(4, true) > 0 &&
    dv.getUint32(4, true) <= 256 * 1024 * 1024
  );
}

function decompressInner(bytes: Uint8Array): Uint8Array {
  return pako.inflate(bytes.subarray(8));
}

function readEntries(buf: Uint8Array): {
  entries: ContainerEntry[];
  origVersion: number;
  curVersion: number;
} {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerOffset = dv.getUint32(0, true);
  const headerSize = dv.getUint32(4, true);
  const origVersion = dv.getInt16(8, true);
  const curVersion = dv.getInt16(10, true);
  const entries: ContainerEntry[] = [];
  for (let i = 0; i < headerSize; i++) {
    const base = headerOffset + i * FILE_ENTRY_SIZE;
    if (base + FILE_ENTRY_SIZE > buf.length) break;
    const nameBytes = buf.subarray(base, base + 128);
    let name: string;
    try {
      name = new TextDecoder("utf-16le").decode(nameBytes).replace(/\0+$/, "");
    } catch {
      continue;
    }
    if (!name) continue;
    const length = dv.getUint32(base + 128, true);
    const startOffset = dv.getUint32(base + 132, true);
    const lastModLow = dv.getUint32(base + 136, true);
    const lastModHigh = dv.getUint32(base + 140, true);
    if (startOffset === 0 || length === 0 || startOffset + length > buf.length)
      continue;
    entries.push({
      name,
      data: buf.slice(startOffset, startOffset + length),
      origStartOffset: startOffset,
      lastModLow,
      lastModHigh,
    });
  }

  return { entries, origVersion, curVersion };
}

function parseConsoleContainer(bytes: Uint8Array): ParsedContainer {
  const buf = decompressInner(bytes);
  const { entries, origVersion, curVersion } = readEntries(buf);
  return { entries, origVersion, curVersion };
}

function encodeUtf16Le(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[i * 2] = code & 0xff;
    buf[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

function rebuildConsoleContainer(
  originalBytes: Uint8Array,
  container: ParsedContainer,
  replacements: Record<string, Uint8Array>,
): Uint8Array {
  const buf = decompressInner(originalBytes);
  const dv0 = new DataView(buf.buffer, buf.byteOffset);
  const origVersion = dv0.getInt16(8, true);
  const curVersion = dv0.getInt16(10, true);
  const sorted = [...container.entries].sort(
    (a, b) => a.origStartOffset - b.origStartOffset,
  );
  const headerBuf = new Uint8Array(INNER_HEADER_SIZE);
  const chunks: Uint8Array[] = [headerBuf];
  let offset = INNER_HEADER_SIZE;
  const newEntries: Array<
    ContainerEntry & { newStart: number; newLength: number }
  > = [];

  for (const entry of sorted) {
    const newStart = offset;
    const data = replacements[entry.name] ?? entry.data;
    chunks.push(data);
    offset += data.length;
    newEntries.push({ ...entry, newStart, newLength: data.length });
  }

  const newHeaderOffset = offset;
  for (const entry of newEntries) {
    const entryBuf = new Uint8Array(FILE_ENTRY_SIZE);
    const edv = new DataView(entryBuf.buffer);
    const nameUtf16 = encodeUtf16Le(entry.name);
    const namePad = new Uint8Array(128);
    namePad.set(nameUtf16.subarray(0, 128));
    entryBuf.set(namePad, 0);
    edv.setUint32(128, entry.newLength, true);
    edv.setUint32(132, entry.newStart, true);
    edv.setUint32(136, entry.lastModLow, true);
    edv.setUint32(140, entry.lastModHigh, true);
    chunks.push(entryBuf);
  }

  const hdv = new DataView(headerBuf.buffer);
  hdv.setUint32(0, newHeaderOffset, true);
  hdv.setUint32(4, newEntries.length, true);
  hdv.setInt16(8, origVersion, true);
  hdv.setInt16(10, curVersion, true);
  const totalSize = chunks.reduce((s, c) => s + c.length, 0);
  const newBuf = new Uint8Array(totalSize);
  let pos = 0;
  for (const c of chunks) {
    newBuf.set(c, pos);
    pos += c.length;
  }

  const compressed = pako.deflate(newBuf);
  const result = new Uint8Array(8 + compressed.length);
  const rdv = new DataView(result.buffer);
  rdv.setUint32(0, 0, true);
  rdv.setUint32(4, newBuf.length, true);
  result.set(compressed, 8);
  return result;
}

const ROMAN = ["", "I", "II", "III", "IV", "V"];
function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

export const SaveService = {
  parseNbt(data: Uint8Array): NbtFile {
    return new NbtReader(data).readFile();
  },

  serializeNbt(file: NbtFile): Uint8Array {
    return new NbtWriter().writeFile(file);
  },

  cloneNbt,
  get,
  nbt,
  isConsoleContainer,
  parseConsoleContainer,
  rebuildConsoleContainer,
  toRoman,
  async loadSaveFile(file: File): Promise<LoadedSave> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (isConsoleContainer(bytes)) {
      const container = parseConsoleContainer(bytes);
      const sorted = [...container.entries].sort(
        (a, b) =>
          (isPlayerFilename(a.name) ? 0 : 1) -
          (isPlayerFilename(b.name) ? 0 : 1),
      );

      let playerFilename: string | null = null;
      let playerNbt: NbtFile | null = null;
      for (const entry of sorted) {
        try {
          const parsed = new NbtReader(entry.data).readFile();
          if (hasInventory(parsed)) {
            playerFilename = entry.name;
            playerNbt = parsed;
            break;
          }
        } catch {
          //neo: what am i even supposed to do here?
        }
      }

      if (!playerNbt || !playerFilename) {
        throw new Error(
          `Save container has ${container.entries.length} embedded files but none contain a player Inventory.\n` +
            "Load the world in-game at least once to generate player data, then try again.",
        );
      }

      let levelFilename: string | null = null;
      let levelNbt: NbtFile | null = null;
      const levelEntry = container.entries.find(
        (e) => e.name.toLowerCase() === "level.dat",
      );
      if (levelEntry) {
        try {
          levelNbt = new NbtReader(levelEntry.data).readFile();
          levelFilename = levelEntry.name;
        } catch {
          //neo: at this point the level.dat isn't valid nbt. what do i do lmfao
        }
      }

      return {
        filename: file.name,
        format: "console_save",
        originalBytes: bytes,
        container,
        playerFilename,
        levelFilename,
        playerNbt,
        levelNbt,
      };
    }

    const playerNbt = new NbtReader(bytes).readFile();
    if (!hasInventory(playerNbt)) {
      throw new Error(
        "File does not appear to be a player .dat file (no Inventory list found).",
      );
    }
    return {
      filename: file.name,
      format: "plain_nbt",
      originalBytes: bytes,
      container: null,
      playerFilename: null,
      levelFilename: null,
      playerNbt,
      levelNbt: null,
    };
  },

  buildSaveBytes(loaded: LoadedSave): Uint8Array {
    if (loaded.format === "plain_nbt") {
      return new NbtWriter().writeFile(loaded.playerNbt);
    }
    const replacements: Record<string, Uint8Array> = {};
    replacements[loaded.playerFilename!] = new NbtWriter().writeFile(
      loaded.playerNbt,
    );
    if (loaded.levelNbt && loaded.levelFilename) {
      replacements[loaded.levelFilename] = new NbtWriter().writeFile(
        loaded.levelNbt,
      );
    }
    return rebuildConsoleContainer(
      loaded.originalBytes,
      loaded.container!,
      replacements,
    );
  },

  getWorldNameFromMs(bytes: Uint8Array): string | null {
    if (!isConsoleContainer(bytes)) {
      try {
        const nbtFile = new NbtReader(bytes).readFile();
        return get.str(nbtFile.root.tags, "LevelName") ?? null;
      } catch {
        return null;
      }
    }
    try {
      const buf = decompressInner(bytes);
      const { entries } = readEntries(buf);
      const levelEntry = entries.find(
        (e) => e.name.toLowerCase() === "level.dat",
      );
      if (!levelEntry) return null;
      const nbtFile = new NbtReader(levelEntry.data).readFile();
      const root = nbtFile.root.tags;
      const data =
        root["Data"]?.type === TagType.Compound
          ? (root["Data"] as NbtCompound).tags
          : root;
      return get.str(data, "LevelName") ?? null;
    } catch {
      return null;
    }
  },
};

function hasInventory(nbtFile: NbtFile): boolean {
  const inv = nbtFile.root.tags["Inventory"];
  return inv?.type === 9;
}

function isPlayerFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("players/") ||
    lower.startsWith("p_") ||
    lower.startsWith("n_")
  );
}
