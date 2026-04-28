import pako from "pako";
import {
  GrfCompressionLevel,
  GrfCompressionType,
  GrfFile,
  GrfFileEntry,
  GrfHeader,
  GrfNode
} from "../types/grf";
export class GrfService {
  private static textDecoder = new TextDecoder("ascii");
  private static textEncoder = new TextEncoder();
  private static rleDecode(data: Uint8Array): Uint8Array {
    const output: number[] = [];
    const marker = 0xff;
    const maxLength = 0xfe;
    let i = 0;
    while (i < data.length) {
      const val = data[i++];
      if (val !== marker) {
        output.push(val);
      } else {
        if (i >= data.length) throw new Error("Invalid RLE");
        const next = data[i++];
        if (next === marker) {
          output.push(marker);
        } else {
          const length = next;
          if (length > 2 && length <= maxLength) {
            if (i >= data.length) throw new Error("Invalid RLE");
            const runVal = data[i++];
            for (let j = 0; j < length + 1; j++) {
              output.push(runVal);
            }
          } else {
            output.push(length);
          }
        }
      }
    }
    return new Uint8Array(output);
  }

  private static rleEncode(data: Uint8Array): Uint8Array {
    const output: number[] = [];
    if (data.length === 0) return new Uint8Array(0);
    const marker = 0xff;
    const maxLength = 0xfe;
    let firstRunValue = data[0];
    let runLength = 1;
    const makeRun = (value: number, length: number) => {
      if ((length <= 3 && value !== marker) || length <= 1) {
        for (let i = 0; i < length; i++) {
          if (value === marker) {
            output.push(marker, marker);
          } else {
            output.push(value);
          }
        }
      } else {
        output.push(marker);
        output.push(length - 1);
        output.push(value);
      }
    };

    for (let i = 1; i < data.length; i++) {
      const currentValue = data[i];
      if (currentValue === firstRunValue) {
        runLength++;
      } else {
        makeRun(firstRunValue, runLength);
        firstRunValue = currentValue;
        runLength = 1;
      }

      if (runLength > maxLength) {
        makeRun(firstRunValue, maxLength);
        runLength -= maxLength;
      }
    }
    makeRun(firstRunValue, runLength);
    return new Uint8Array(output);
  }

  private static readStringList(view: DataView, off: { p: number }): string[] {
    const count = view.getInt32(off.p, false);
    off.p += 4;
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const len = view.getInt16(off.p, false);
      off.p += 2;
      const str = this.textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + off.p, len));
      off.p += len;
      list.push(str);
    }
    return list;
  }

  public static readGRF(buffer: ArrayBuffer): GrfFile {
    const view = new DataView(buffer);
    let off = { p: 0 };
    const firstWord = view.getUint16(off.p, false);
    off.p += 2;
    let header: GrfHeader;
    if (firstWord === 0) {
      off.p += 14;
      header = {
        compressionLevel: GrfCompressionLevel.None,
        crc: 0xffffffff,
        compressionType: GrfCompressionType.Unknown,
        unknownData: new Uint8Array([0, 0, 0, 0])
      };
    } else {
      const compressionLevel = view.getUint8(off.p++) as GrfCompressionLevel;
      const crc = view.getUint32(off.p, false);
      off.p += 4;
      const unknownData = new Uint8Array(view.buffer, view.byteOffset + off.p, 4);
      off.p += 4;
      if (unknownData[3] > 0) {
        throw new Error("World grf's are not currently supported.");
      }
      header = {
        compressionLevel,
        crc,
        compressionType: GrfCompressionType.Zlib,
        unknownData
      };
    }

    let bodyData: Uint8Array;
    let bodyView: DataView;
    let bodyOff = { p: 0 };
    if (header.compressionLevel !== GrfCompressionLevel.None) {
      view.getInt32(off.p, false); //neo: this is decompressedSize
      off.p += 4;
      const compressedSize = view.getInt32(off.p, false);
      off.p += 4;
      const compressedData = new Uint8Array(view.buffer, view.byteOffset + off.p, compressedSize);
      off.p += compressedSize;
      let decompressed: Uint8Array;
      if (header.compressionType === GrfCompressionType.Zlib || true) {
        try {
          decompressed = pako.inflate(compressedData);
        } catch {
          decompressed = pako.inflateRaw(compressedData); //neo: fallback to pako.inflateRaw if raw deflate
        }
      }

      if (header.compressionLevel > GrfCompressionLevel.Compressed) {
        bodyData = this.rleDecode(decompressed!);
      } else {
        bodyData = decompressed!;
      }

      bodyView = new DataView(bodyData.buffer, bodyData.byteOffset, bodyData.byteLength);
    } else {
      bodyData = new Uint8Array(view.buffer, view.byteOffset + off.p);
      bodyView = new DataView(bodyData.buffer, bodyData.byteOffset, bodyData.byteLength);
    }

    const lut = this.readStringList(bodyView, bodyOff);
    const fileCount = bodyView.getInt32(bodyOff.p, false);
    bodyOff.p += 4;
    const files: GrfFileEntry[] = [];
    for (let i = 0; i < fileCount; i++) {
      const nlen = bodyView.getInt16(bodyOff.p, false);
      bodyOff.p += 2;
      const filename = this.textDecoder.decode(new Uint8Array(bodyView.buffer, bodyView.byteOffset + bodyOff.p, nlen));
      bodyOff.p += nlen;
      const size = bodyView.getInt32(bodyOff.p, false);
      bodyOff.p += 4;
      const data = new Uint8Array(bodyView.buffer, bodyView.byteOffset + bodyOff.p, size).slice();
      bodyOff.p += size;
      files.push({ filename, data });
    }

    const root: GrfNode = { name: "__ROOT__", parameters: [], children: [] };
    this.readGameRuleHierarchy(bodyView, bodyOff, root, lut);
    return { header, files, root };
  }

  private static readGameRuleHierarchy(view: DataView, off: { p: number }, parent: GrfNode, lut: string[]) {
    const count = view.getInt32(off.p, false);
    off.p += 4;
    for (let i = 0; i < count; i++) {
      const nameIdx = view.getInt32(off.p, false);
      off.p += 4;
      const paramCount = view.getInt32(off.p, false);
      off.p += 4;

      const node: GrfNode = {
        name: lut[nameIdx],
        parameters: [],
        children: []
      };

      for (let j = 0; j < paramCount; j++) {
        const kIdx = view.getInt32(off.p, false);
        off.p += 4;
        const vLen = view.getInt16(off.p, false);
        off.p += 2;
        const value = this.textDecoder.decode(new Uint8Array(view.buffer, view.byteOffset + off.p, vLen));
        off.p += vLen;
        node.parameters.push({ name: lut[kIdx], value });
      }

      parent.children.push(node);
      this.readGameRuleHierarchy(view, off, node, lut);
    }
  }

  private static makeString(s: string): Uint8Array {
    const enc = this.textEncoder.encode(s);
    const out = new Uint8Array(2 + enc.length);
    new DataView(out.buffer).setInt16(0, enc.length, false);
    out.set(enc, 2);
    return out;
  }

  public static serializeGRF(grf: GrfFile): ArrayBuffer {
    const lut: string[] = [];
    const buildLut = (node: GrfNode) => {
      if (!lut.includes(node.name) && node.name !== "__ROOT__") lut.push(node.name);
      for (const p of node.parameters) {
        if (!lut.includes(p.name)) lut.push(p.name);
      }
      for (const c of node.children) buildLut(c);
    };
    buildLut(grf.root);
    let parts: Uint8Array[] = [];
    const lutCount = new Uint8Array(4);
    new DataView(lutCount.buffer).setInt32(0, lut.length, false);
    parts.push(lutCount);
    for (const s of lut) parts.push(this.makeString(s));
    const fCount = new Uint8Array(4);
    new DataView(fCount.buffer).setInt32(0, grf.files.length, false);
    parts.push(fCount);
    for (const f of grf.files) {
      parts.push(this.makeString(f.filename));
      const sz = new Uint8Array(4);
      new DataView(sz.buffer).setInt32(0, f.data.length, false);
      parts.push(sz);
      parts.push(f.data);
    }

    const writeNode = (node: GrfNode) => {
      const cCount = new Uint8Array(4);
      new DataView(cCount.buffer).setInt32(0, node.children.length, false);
      parts.push(cCount);
      for (const c of node.children) {
        const nid = new Uint8Array(4);
        new DataView(nid.buffer).setInt32(0, lut.indexOf(c.name), false);
        parts.push(nid);
        const pCount = new Uint8Array(4);
        new DataView(pCount.buffer).setInt32(0, c.parameters.length, false);
        parts.push(pCount);
        for (const p of c.parameters) {
          const pid = new Uint8Array(4);
          new DataView(pid.buffer).setInt32(0, lut.indexOf(p.name), false);
          parts.push(pid);
          parts.push(this.makeString(p.value));
        }

        writeNode(c);
      }
    };
    writeNode(grf.root);
    let uncompressedSize = parts.reduce((acc, p) => acc + p.length, 0);
    const uncompressedData = new Uint8Array(uncompressedSize);
    let offset = 0;
    for (const p of parts) {
      uncompressedData.set(p, offset);
      offset += p.length;
    }

    let bodyData = uncompressedData;
    let header = grf.header;
    if (header.compressionLevel >= GrfCompressionLevel.CompressedRle) {
      bodyData = this.rleEncode(bodyData);
    }

    let compressedSize = 0;
    if (header.compressionLevel >= GrfCompressionLevel.Compressed) {
      bodyData = pako.deflate(bodyData, { level: 9 });
      compressedSize = bodyData.length;
    }

    const finalBuffer = new Uint8Array(11 + (header.compressionLevel >= GrfCompressionLevel.Compressed ? 8 : 0) + bodyData.length);
    const fw = new DataView(finalBuffer.buffer);
    let poff = 0;
    fw.setInt16(poff, 1, false); poff += 2;
    fw.setUint8(poff, header.compressionLevel); poff += 1;
    fw.setUint32(poff, header.crc, false); poff += 4;
    finalBuffer.set(header.unknownData, poff); poff += 4;
    if (header.compressionLevel >= GrfCompressionLevel.Compressed) {
      fw.setInt32(poff, uncompressedSize, false); poff += 4;
      fw.setInt32(poff, compressedSize, false); poff += 4;
    }

    finalBuffer.set(bodyData as any, poff);

    return finalBuffer.buffer;
  }

  public static createDefaultGRF(): GrfFile {
    return {
      header: {
        compressionLevel: GrfCompressionLevel.CompressedRle,
        crc: 0,
        compressionType: GrfCompressionType.Zlib,
        unknownData: new Uint8Array([0, 0, 0, 0])
      },
      files: [],
      root: {
        name: "__ROOT__",
        parameters: [],
        children: []
      }
    };
  }
}
