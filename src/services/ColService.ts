import { ColFile, ColColor, ColWorldColor } from "../types/col";
export class ColService {
  private static textDecoder = new TextDecoder("utf-8");
  private static textEncoder = new TextEncoder();
  public static readCOL(buffer: ArrayBuffer): ColFile {
    const view = new DataView(buffer);
    let offset = 0;
    const version = view.getInt32(offset, false); offset += 4;
    const colorCount = view.getInt32(offset, false); offset += 4;
    const colors: ColColor[] = [];
    for (let i = 0; i < colorCount; i++) {
      const nameLength = view.getUint16(offset, false); offset += 2;
      const name = this.textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset, nameLength));
      offset += nameLength;
      const color = view.getUint32(offset, false); offset += 4;
      colors.push({ name, color });
    }

    const worldColors: ColWorldColor[] = [];
    if (version > 0 && offset < view.byteLength) {
      const worldColorCount = view.getInt32(offset, false); offset += 4;
      for (let i = 0; i < worldColorCount; i++) {
        const nameLength = view.getUint16(offset, false); offset += 2;
        const name = this.textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + offset, nameLength));
        offset += nameLength;
        const waterColor = view.getUint32(offset, false); offset += 4;
        const underwaterColor = view.getUint32(offset, false); offset += 4;
        const fogColor = view.getUint32(offset, false); offset += 4;
        worldColors.push({ name, waterColor, underwaterColor, fogColor });
      }
    }

    return { version, colors, worldColors };
  }

  public static serializeCOL(col: ColFile): ArrayBuffer {
    let size = 8;
    for (const c of col.colors) {
      const nameBytes = this.textEncoder.encode(c.name);
      size += 2 + nameBytes.length + 4;
    }

    if (col.version > 0) {
      size += 4;
      for (const w of col.worldColors) {
        const nameBytes = this.textEncoder.encode(w.name);
        size += 2 + nameBytes.length + 12;
      }
    }

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const out = new Uint8Array(buffer);
    let offset = 0;
    view.setInt32(offset, col.version, false); offset += 4;
    view.setInt32(offset, col.colors.length, false); offset += 4;
    for (const c of col.colors) {
      const nameBytes = this.textEncoder.encode(c.name);
      view.setUint16(offset, nameBytes.length, false); offset += 2;
      out.set(nameBytes, offset); offset += nameBytes.length;
      view.setUint32(offset, c.color, false); offset += 4;
    }

    if (col.version > 0) {
      view.setInt32(offset, col.worldColors.length, false); offset += 4;
      for (const w of col.worldColors) {
        const nameBytes = this.textEncoder.encode(w.name);
        view.setUint16(offset, nameBytes.length, false); offset += 2;
        out.set(nameBytes, offset); offset += nameBytes.length;
        view.setUint32(offset, w.waterColor, false); offset += 4;
        view.setUint32(offset, w.underwaterColor, false); offset += 4;
        view.setUint32(offset, w.fogColor, false); offset += 4;
      }
    }

    return buffer;
  }
}
