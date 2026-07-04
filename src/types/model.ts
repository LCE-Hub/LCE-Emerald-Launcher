export interface Vec3 {
  X: number;
  Y: number;
  Z: number;
}

export interface Vec2 {
  X: number;
  Y: number;
}

export interface ModelBox {
  pos: Vec3;
  size: Vec3;
  uv: Vec2;
  inflate?: number;
  mirror?: boolean;
}

export interface ModelPart {
  name: string;
  translation?: Vec3;
  rotation?: Vec3;
  boxes: ModelBox[];
}

export interface ModelTexture {
  name: string;
  data: string;
}

export interface ModelFile {
  name: string;
  textureSize: Vec2;
  parts: ModelPart[];
  textures?: ModelTexture[];
}

export interface ModelContainer {
  models: ModelFile[];
}
