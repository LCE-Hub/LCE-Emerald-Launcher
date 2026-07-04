import { ModelFile, ModelPart, ModelBox, ModelTexture, Vec3 } from "../types/model";

interface BBElement {
  name: string;
  type: string;
  from: number[];
  to: number[];
  uv_offset: number[];
  inflate?: number;
  mirror_uv?: boolean;
  rotation?: number[];
  origin?: number[];
}

interface BBTexture {
  name: string;
  source: string;
}

interface BBOutline {
  name: string;
  origin?: number[];
  rotation?: number[];
  children: (BBOutline | string)[];
}

interface BBModel {
  name: string;
  model_identifier: string;
  resolution: { width: number; height: number };
  elements: BBElement[];
  textures: BBTexture[];
  outliner: (BBOutline | string)[];
}

export class ModelService {
  static async importFromBBModel(buffer: ArrayBuffer): Promise<ModelFile> {
    const text = new TextDecoder("utf-8").decode(buffer);
    const bb: BBModel = JSON.parse(text);

    const textures: ModelTexture[] = (bb.textures || [])
      .filter((t) => t.name && t.source)
      .map((t) => ({ name: t.name, data: t.source }));

    const model: ModelFile = {
      name: bb.model_identifier || bb.name,
      textureSize: { X: bb.resolution.width, Y: bb.resolution.height },
      parts: [],
      textures: textures.length > 0 ? textures : undefined,
    };

    const rootOutline = bb.outliner.find(
      (o): o is BBOutline =>
        typeof o === "object" && o.name === model.name,
    );

    const outlines = rootOutline?.children ?? bb.outliner;

    for (const item of outlines) {
      if (typeof item === "object") {
        const parts = this.convertOutline(item, bb.elements);
        model.parts.push(...parts);
      }
    }

    return model;
  }

  private static convertOutline(
    outline: BBOutline,
    elements: BBElement[],
  ): ModelPart[] {
    const parts: ModelPart[] = [];

    const boxElements = outline.children.filter(
      (c): c is string => typeof c === "string",
    );

    const childOutlines = outline.children.filter(
      (c): c is BBOutline => typeof c === "object",
    );

    const boxes: ModelBox[] = [];
    for (const uuid of boxElements) {
      const el = elements.find((e) => e.name === uuid || this.guessUuid(e) === uuid);
      if (el && el.type === "cube") {
        boxes.push(this.elementToBox(el));
      }
    }

    const translation: Vec3 = outline.origin
      ? { X: outline.origin[0], Y: outline.origin[1], Z: outline.origin[2] }
      : { X: 0, Y: 0, Z: 0 };

    const rotation: Vec3 = outline.rotation
      ? { X: outline.rotation[0], Y: outline.rotation[1], Z: outline.rotation[2] }
      : { X: 0, Y: 0, Z: 0 };

    if (boxes.length > 0 || childOutlines.length === 0) {
      parts.push({
        name: outline.name,
        translation,
        rotation,
        boxes,
      });
    }

    for (const child of childOutlines) {
      parts.push(...this.convertOutline(child, elements));
    }

    return parts;
  }

  private static guessUuid(el: BBElement): string {
    return el.name;
  }

  private static elementToBox(el: BBElement): ModelBox {
    const pos: Vec3 = {
      X: el.from[0],
      Y: el.from[1],
      Z: el.from[2],
    };
    const size: Vec3 = {
      X: el.to[0] - el.from[0],
      Y: el.to[1] - el.from[1],
      Z: el.to[2] - el.from[2],
    };
    return {
      pos,
      size,
      uv: { X: el.uv_offset?.[0] ?? 0, Y: el.uv_offset?.[1] ?? 0 },
      inflate: el.inflate,
      mirror: el.mirror_uv,
    };
  }

  static exportToBBModel(model: ModelFile): ArrayBuffer {
    const elements: BBElement[] = [];
    const outliner: (BBOutline | string)[] = [];

    for (const part of model.parts) {
      const partOutlines = this.partToOutline(part, elements);
      outliner.push(...partOutlines);
    }

    const bb: BBModel = {
      name: model.name,
      model_identifier: model.name,
      resolution: { width: model.textureSize.X, height: model.textureSize.Y },
      elements,
      textures: (model.textures || []).map((t) => ({
        name: t.name,
        source: t.data,
      })),
      outliner: [{ name: model.name, children: outliner }],
    };

    const json = JSON.stringify(bb, null, 2);
    return new TextEncoder().encode(json).buffer as ArrayBuffer;
  }

  private static partToOutline(
    part: ModelPart,
    elements: BBElement[],
  ): BBOutline[] {
    const boxUuids: string[] = [];

    for (const box of part.boxes) {
      const uuid = `box_${elements.length}`;
      boxUuids.push(uuid);
      const to: number[] = [
        box.pos.X + box.size.X,
        box.pos.Y + box.size.Y,
        box.pos.Z + box.size.Z,
      ];
      elements.push({
        name: uuid,
        type: "cube",
        from: [box.pos.X, box.pos.Y, box.pos.Z],
        to,
        uv_offset: [box.uv.X, box.uv.Y],
        inflate: box.inflate,
        mirror_uv: box.mirror,
      });
    }

    return [
      {
        name: part.name,
        origin: part.translation
          ? [part.translation.X, part.translation.Y, part.translation.Z]
          : undefined,
        rotation: undefined,
        children: boxUuids,
      },
    ];
  }

  static importFromJSON(json: string): ModelFile[] {
    const data = JSON.parse(json);
    return Object.entries(data).map(([name, val]: [string, any]) => ({
      name,
      textureSize: val.textureSize as { X: number; Y: number },
      parts: (val.parts as any[]).map(
        (p: any): ModelPart => ({
          name: p.name,
          translation: p.translation,
          rotation: p.rotation,
          boxes: (p.boxes as any[]).map(
            (b: any): ModelBox => ({
              pos: b.pos,
              size: b.size,
              uv: b.uv,
              inflate: b.inflate,
              mirror: b.mirror,
            }),
          ),
        }),
      ),
    }));
  }

  static createDefaultModel(name: string): ModelFile {
    return {
      name,
      textureSize: { X: 64, Y: 64 },
      parts: [
        {
          name: "body",
          boxes: [
            {
              pos: { X: -4, Y: 0, Z: -2 },
              size: { X: 8, Y: 12, Z: 4 },
              uv: { X: 0, Y: 0 },
            },
          ],
        },
      ],
    };
  }
}
