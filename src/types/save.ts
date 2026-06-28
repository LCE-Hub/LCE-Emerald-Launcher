export enum TagType {
  End = 0,
  Byte = 1,
  Short = 2,
  Int = 3,
  Long = 4,
  Float = 5,
  Double = 6,
  ByteArray = 7,
  String = 8,
  List = 9,
  Compound = 10,
  IntArray = 11,
  LongArray = 12,
}

export interface NbtByte {
  type: TagType.Byte;
  value: number;
}
export interface NbtShort {
  type: TagType.Short;
  value: number;
}
export interface NbtInt {
  type: TagType.Int;
  value: number;
}
export interface NbtLong {
  type: TagType.Long;
  value: bigint;
}
export interface NbtFloat {
  type: TagType.Float;
  value: number;
}
export interface NbtDouble {
  type: TagType.Double;
  value: number;
}
export interface NbtString {
  type: TagType.String;
  value: string;
}
export interface NbtByteArray {
  type: TagType.ByteArray;
  value: Uint8Array;
}
export interface NbtIntArray {
  type: TagType.IntArray;
  value: Int32Array;
}
export interface NbtLongArray {
  type: TagType.LongArray;
  value: BigInt64Array;
}
export interface NbtList {
  type: TagType.List;
  elementType: TagType;
  items: NbtValue[];
}
export interface NbtCompound {
  type: TagType.Compound;
  tags: Record<string, NbtValue>;
}
export type NbtValue =
  | NbtByte
  | NbtShort
  | NbtInt
  | NbtLong
  | NbtFloat
  | NbtDouble
  | NbtString
  | NbtByteArray
  | NbtIntArray
  | NbtLongArray
  | NbtList
  | NbtCompound;

export interface NbtFile {
  rootName: string;
  root: NbtCompound;
}

export interface ContainerEntry {
  name: string;
  data: Uint8Array;
  origStartOffset: number;
  lastModLow: number;
  lastModHigh: number;
}

export interface ParsedContainer {
  origVersion: number;
  curVersion: number;
  entries: ContainerEntry[];
}

export interface LoadedSave {
  filename: string;
  format: "console_save" | "plain_nbt";
  originalBytes: Uint8Array;
  container: ParsedContainer | null;
  playerFilename: string | null;
  levelFilename: string | null;
  playerNbt: NbtFile;
  levelNbt: NbtFile | null;
}

export interface InventoryItem {
  slot: number;
  id: number;
  count: number;
  damage: number;
  enchants: EnchantEntry[];
}

export interface EnchantEntry {
  id: number;
  lvl: number;
}

export interface EnchantDef {
  id: number;
  name: string;
  maxLevel: number;
  applies: ("sword" | "tool" | "armor" | "bow" | "fishing" | "all")[];
}
