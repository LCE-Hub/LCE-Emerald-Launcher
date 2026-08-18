import pako from "pako";
export interface SwfTag {
  code: number;
  data: Uint8Array;
}

export interface SwfImage {
  id: number;
  type: "jpeg" | "png" | "lossless" | "unknown" | "gif";
  name?: string;
  data: Uint8Array;
  alphaData?: Uint8Array;
  width?: number;
  height?: number;
  format?: number;
  hasAlpha?: boolean;
}

export class SwfService {
  static parse(buffer: Uint8Array): {
    version: number;
    compressed: boolean;
    frameHeader: Uint8Array;
    tags: SwfTag[];
  } {
    if (buffer.length < 8) throw new Error("Invalid SWF: file too small");
    const sig = String.fromCharCode(buffer[0], buffer[1], buffer[2]);
    const version = buffer[3];
    let data: Uint8Array;
    if (sig === "FWS") {
      data = buffer.slice(8);
    } else if (sig === "CWS") {
      try {
        data = pako.inflate(buffer.slice(8));
      } catch (e) {
        throw new Error("Failed to decompress CWS SWF");
      }
    } else {
      throw new Error(`Unsupported SWF signature: ${sig}`);
    }

    let offset = 0;
    const nbits = data[0] >> 3;
    const rectBytes = Math.ceil((5 + nbits * 4) / 8);
    const frameHeaderLength = rectBytes + 4;
    const frameHeader = data.slice(0, frameHeaderLength);
    offset = frameHeaderLength;

    const tags: SwfTag[] = [];
    while (offset < data.length) {
      const tagHeader = data[offset] | (data[offset + 1] << 8);
      offset += 2;
      const code = tagHeader >> 6;
      let length = tagHeader & 0x3f;
      if (length === 0x3f) {
        length =
          data[offset] |
          (data[offset + 1] << 8) |
          (data[offset + 2] << 16) |
          (data[offset + 3] << 24);
        offset += 4;
      }
      const tagData = data.slice(offset, offset + length);
      tags.push({ code, data: tagData });
      offset += length;
      if (code === 0) break;
    }

    return { version, compressed: sig === "CWS", frameHeader, tags };
  }

  static serialize(
    version: number,
    compressed: boolean,
    frameHeader: Uint8Array,
    tags: SwfTag[],
  ): Uint8Array {
    const payloads: Uint8Array[] = [frameHeader];
    let bodyLength = frameHeader.length;

    for (const tag of tags) {
      const isLong = tag.data.length >= 0x3f;
      const headerLen = isLong ? 6 : 2;
      const header = new Uint8Array(headerLen);
      const h = (tag.code << 6) | (isLong ? 0x3f : tag.data.length);
      header[0] = h & 0xff;
      header[1] = (h >> 8) & 0xff;
      if (isLong) {
        header[2] = tag.data.length & 0xff;
        header[3] = (tag.data.length >> 8) & 0xff;
        header[4] = (tag.data.length >> 16) & 0xff;
        header[5] = (tag.data.length >> 24) & 0xff;
      }
      payloads.push(header, tag.data);
      bodyLength += headerLen + tag.data.length;
    }

    const uncompressedBody = new Uint8Array(bodyLength);
    let offset = 0;
    for (const p of payloads) {
      uncompressedBody.set(p, offset);
      offset += p.length;
    }

    const fileLength = 8 + uncompressedBody.length;
    const finalBody = compressed
      ? pako.deflate(uncompressedBody)
      : uncompressedBody;
    const result = new Uint8Array(8 + finalBody.length);
    result.set(new TextEncoder().encode(compressed ? "CWS" : "FWS"), 0);
    result[3] = version;
    result[4] = fileLength & 0xff;
    result[5] = (fileLength >> 8) & 0xff;
    result[6] = (fileLength >> 16) & 0xff;
    result[7] = (fileLength >> 24) & 0xff;
    result.set(finalBody, 8);

    return result;
  }

  static extractImages(tags: SwfTag[]): SwfImage[] {
    const images: SwfImage[] = [];
    const nameMap: Record<number, string> = {};
    let jpegTables: Uint8Array | null = null;

    for (const tag of tags) {
      if (tag.code === 8) {
        jpegTables = tag.data;
      } else if (tag.code === 56 || tag.code === 76) {
        const numAssets = tag.data[0] | (tag.data[1] << 8);
        let ptr = 2;
        for (let i = 0; i < numAssets; i++) {
          const charId = tag.data[ptr] | (tag.data[ptr + 1] << 8);
          ptr += 2;
          let end = ptr;
          while (end < tag.data.length && tag.data[end] !== 0) end++;
          nameMap[charId] = new TextDecoder().decode(tag.data.slice(ptr, end));
          ptr = end + 1;
        }
      } else if (tag.code === 6 || tag.code === 21) {
        const charId = tag.data[0] | (tag.data[1] << 8);
        const imgData = tag.data.slice(2);
        const fixed = this.fixJpeg(imgData, tag.code === 6 ? jpegTables : null);
        images.push({
          id: charId,
          type: "jpeg",
          data: fixed,
          name: nameMap[charId],
        });
      } else if (tag.code === 35) {
        const charId = tag.data[0] | (tag.data[1] << 8);
        const alphaOffset =
          tag.data[2] |
          (tag.data[3] << 8) |
          (tag.data[4] << 16) |
          (tag.data[5] << 24);
        const imgData = tag.data.slice(6, 6 + alphaOffset);
        const alphaRaw = tag.data.slice(6 + alphaOffset);
        let alpha = undefined;
        try {
          alpha = pako.inflate(alphaRaw);
        } catch (e) {}
        images.push({
          id: charId,
          type: "jpeg",
          data: this.fixJpeg(imgData),
          alphaData: alpha,
          name: nameMap[charId],
        });
      } else if (tag.code === 20 || tag.code === 36) {
        const charId = tag.data[0] | (tag.data[1] << 8);
        const format = tag.data[2];
        const width = tag.data[3] | (tag.data[4] << 8);
        const height = tag.data[5] | (tag.data[6] << 8);
        const hasAlpha = tag.code === 36;
        const raw = tag.data.slice(tag.code === 20 ? 7 : 7);

        images.push({
          id: charId,
          type: "lossless", //neo: aka PNG
          data: raw,
          width,
          height,
          format,
          hasAlpha,
          name: nameMap[charId],
        });
      }
    }
    return images;
  }

  private static fixJpeg(
    data: Uint8Array,
    jtt: Uint8Array | null = null,
  ): Uint8Array {
    let combined = data;
    if (jtt && jtt.length > 0) {
      let tLen = jtt.length;
      if (jtt[tLen - 2] === 0xff && jtt[tLen - 1] === 0xd9) tLen -= 2;
      let start = 0;
      if (data[0] === 0xff && data[1] === 0xd8) start = 2;
      combined = new Uint8Array(tLen + data.length - start);
      combined.set(jtt.slice(0, tLen), 0);
      combined.set(data.slice(start), tLen);
    }
    return combined;
  }

  static async decodeLosslessToRGBA(img: SwfImage): Promise<Uint8Array> {
    if (img.type !== "lossless" || !img.width || !img.height)
      return new Uint8Array(0);
    const decoded = pako.inflate(img.data);
    const rgba = new Uint8Array(img.width * img.height * 4);
    if (img.format === 3) {
      const colorTableSize = decoded[0] + 1;
      let ptr = 1;
      const palette: number[][] = [];
      for (let i = 0; i < colorTableSize; i++) {
        if (img.hasAlpha) {
          const a = decoded[ptr++];
          const r_pm = decoded[ptr++];
          const g_pm = decoded[ptr++];
          const b_pm = decoded[ptr++];
          palette.push([
            a > 0 ? Math.min(255, (r_pm * 255) / a) : 0,
            a > 0 ? Math.min(255, (g_pm * 255) / a) : 0,
            a > 0 ? Math.min(255, (b_pm * 255) / a) : 0,
            a,
          ]);
        } else {
          palette.push([decoded[ptr++], decoded[ptr++], decoded[ptr++], 255]);
        }
      }
      const rowStride = Math.ceil(img.width / 4) * 4;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = decoded[ptr + y * rowStride + x];
          const color = palette[idx] || [0, 0, 0, 0];
          const offset = (y * img.width + x) * 4;
          rgba[offset] = color[0];
          rgba[offset + 1] = color[1];
          rgba[offset + 2] = color[2];
          rgba[offset + 3] = color[3];
        }
      }
    } else if (img.format === 4) {
      const rowStride = Math.ceil((img.width * 2) / 4) * 4;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const p =
            decoded[y * rowStride + x * 2] |
            (decoded[y * rowStride + x * 2 + 1] << 8);
          const r = ((p >> 10) & 0x1f) << 3;
          const g = ((p >> 5) & 0x1f) << 3;
          const b = (p & 0x1f) << 3;
          const offset = (y * img.width + x) * 4;
          rgba[offset] = r;
          rgba[offset + 1] = g;
          rgba[offset + 2] = b;
          rgba[offset + 3] = 255;
        }
      }
    } else if (img.format === 5) {
      let ptr = 0;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const a = decoded[ptr++];
          const r_pm = decoded[ptr++];
          const g_pm = decoded[ptr++];
          const b_pm = decoded[ptr++];
          const offset = (y * img.width + x) * 4;
          if (img.hasAlpha) {
            rgba[offset] = a > 0 ? Math.min(255, (r_pm * 255) / a) : 0;
            rgba[offset + 1] = a > 0 ? Math.min(255, (g_pm * 255) / a) : 0;
            rgba[offset + 2] = a > 0 ? Math.min(255, (b_pm * 255) / a) : 0;
            rgba[offset + 3] = a;
          } else {
            rgba[offset] = r_pm;
            rgba[offset + 1] = g_pm;
            rgba[offset + 2] = b_pm;
            rgba[offset + 3] = 255;
          }
        }
      }
    }
    return rgba;
  }

  static updateImageTag(
    tags: SwfTag[],
    charId: number,
    newData: Uint8Array,
    type: SwfImage["type"],
  ): SwfTag[] {
    return tags.map((tag) => {
      if (
        tag.code === 6 ||
        tag.code === 21 ||
        tag.code === 35 ||
        tag.code === 20 ||
        tag.code === 36
      ) {
        const id = tag.data[0] | (tag.data[1] << 8);
        if (id === charId) {
          let payload: Uint8Array;
          if (type === "jpeg") {
            const header = new Uint8Array(tag.code === 35 ? 6 : 2);
            header[0] = id & 0xff;
            header[1] = (id >> 8) & 0xff;
            if (tag.code === 35) {
              payload = newData;
            } else {
              payload = new Uint8Array(2 + newData.length);
              payload.set(header, 0);
              payload.set(newData, 2);
            }
          } else {
            payload = newData;
          }
          return { ...tag, data: payload };
        }
      }
      return tag;
    });
  }
}
