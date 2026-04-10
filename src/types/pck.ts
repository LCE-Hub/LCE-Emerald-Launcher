export enum PCKAssetType {
  SKIN = 0,
  CAPE = 1,
  TEXTURE = 2,
  UI_DATA = 3,
  INFO = 4,
  TEXTURE_PACK_INFO = 5,
  LOCALISATION = 6,
  GAME_RULES = 7,
  AUDIO_DATA = 8,
  COLOUR_TABLE = 9,
  GAME_RULES_HEADER = 10,
  SKIN_DATA = 11,
  MODELS = 12,
  BEHAVIOURS = 13,
  MATERIALS = 14,
}

export interface PCKProperty {
  key: string;
  value: string;
}

export interface PCKAsset {
  id: string;
  path: string;
  type: PCKAssetType;
  size: number;
  data: Uint8Array;
  properties: PCKProperty[];
}

export interface PCKFile {
  version: number;
  endianness: "little" | "big";
  xmlSupport: boolean;
  properties: string[];
  files: PCKAsset[];
}
