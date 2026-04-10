import { PCKAssetType, PCKAsset, PCKFile, PCKProperty } from "../types/pck";
export class PckService {
  private static decodeU16(buffer: ArrayBuffer, length: number, offset: number, littleEndian: boolean): string {
    const uint16Array = new Uint16Array(length);
    const view = new DataView(buffer);
    for (let i = 0; i < length; i++) {
      uint16Array[i] = view.getUint16(offset + (i * 2), littleEndian);
    }
    return String.fromCharCode(...uint16Array);
  }

  private static encodeU16(str: string, littleEndian: boolean): Uint8Array {
    const buf = new ArrayBuffer(str.length * 2);
    const view = new DataView(buf);
    for (let i = 0; i < str.length; i++) {
      view.setUint16(i * 2, str.charCodeAt(i), littleEndian);
    }
    return new Uint8Array(buf);
  }

  static async readPCK(buffer: ArrayBuffer): Promise<PCKFile> {
    const view = new DataView(buffer);
    let offset = 0;
    let version = view.getUint32(offset, true);
    let littleEndian = true;
    if (version > 3) {
      version = view.getUint32(offset, false);
      littleEndian = false;
    }
    offset += 4;
    if (version > 3) throw new Error("Invalid PCK version");
    const propertyCount = view.getUint32(offset, littleEndian);
    offset += 4;
    const properties: string[] = [];
    for (let i = 0; i < propertyCount; i++) {
      view.getUint32(offset, littleEndian); //neo: this is propertyIndex
      offset += 4;
      const stringLength = view.getUint32(offset, littleEndian);
      offset += 4;
      const property = this.decodeU16(buffer, stringLength, offset, littleEndian);
      offset += stringLength * 2;
      offset += 4;
      properties.push(property);
    }

    let xmlSupport = properties.includes("XMLVERSION");
    if (xmlSupport) {
      offset += 4;
    }

    const fileCount = view.getUint32(offset, littleEndian);
    offset += 4;

    const fileInfos: { size: number; type: number; path: string }[] = [];
    for (let i = 0; i < fileCount; i++) {
      const fileSize = view.getUint32(offset, littleEndian);
      offset += 4;
      const fileType = view.getUint32(offset, littleEndian);
      offset += 4;
      const pathLength = view.getUint32(offset, littleEndian);
      offset += 4;
      const path = this.decodeU16(buffer, pathLength, offset, littleEndian).replace(/\\/g, "/");
      offset += pathLength * 2;
      offset += 4;
      fileInfos.push({ size: fileSize, type: fileType, path });
    }

    const assets: PCKAsset[] = [];
    for (const info of fileInfos) {
      const assetPropertyCount = view.getUint32(offset, littleEndian);
      offset += 4;

      const assetProperties: PCKProperty[] = [];
      for (let j = 0; j < assetPropertyCount; j++) {
        const propIdx = view.getUint32(offset, littleEndian);
        offset += 4;
        const valLen = view.getUint32(offset, littleEndian);
        offset += 4;
        const val = this.decodeU16(buffer, valLen, offset, littleEndian);
        offset += valLen * 2;
        offset += 4;
        assetProperties.push({ key: properties[propIdx], value: val });
      }

      const data = new Uint8Array(buffer.slice(offset, offset + info.size));
      offset += info.size;

      assets.push({
        id: Math.random().toString(36).substr(2, 9),
        path: info.path,
        type: info.type as PCKAssetType,
        size: info.size,
        data,
        properties: assetProperties
      });
    }

    return {
      version,
      endianness: littleEndian ? "little" : "big",
      xmlSupport,
      properties,
      files: assets
    };
  }

  static serializePCK(pck: PCKFile): ArrayBuffer {
    const littleEndian = pck.endianness === "little";
    let totalSize = 4 + 4;
    const propertySet = new Set<string>();
    if (pck.xmlSupport) propertySet.add("XMLVERSION");
    pck.files.forEach(f => f.properties.forEach(p => propertySet.add(p.key)));
    const finalProperties = Array.from(propertySet);

    finalProperties.forEach((prop) => {
      totalSize += 4 + 4 + (prop.length * 2) + 4;
    });

    if (pck.xmlSupport) totalSize += 4;
    totalSize += 4;
    pck.files.forEach(f => {
      totalSize += 4 + 4 + 4 + (f.path.length * 2) + 4;
    });

    pck.files.forEach(f => {
      totalSize += 4;
      f.properties.forEach(p => {
        totalSize += 4 + 4 + (p.value.length * 2) + 4;
      });
      totalSize += f.data.length;
    });

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint32(offset, pck.version, littleEndian);
    offset += 4;

    view.setUint32(offset, finalProperties.length, littleEndian);
    offset += 4;

    finalProperties.forEach((prop) => {
      view.setUint32(offset, finalProperties.indexOf(prop), littleEndian);
      offset += 4;
      view.setUint32(offset, prop.length, littleEndian);
      offset += 4;
      const encoded = this.encodeU16(prop, littleEndian);
      new Uint8Array(buffer, offset, encoded.length).set(encoded);
      offset += encoded.length;
      view.setUint32(offset, 0, littleEndian);
      offset += 4;
    });

    if (pck.xmlSupport) {
      view.setUint32(offset, 3, littleEndian);
      offset += 4;
    }

    view.setUint32(offset, pck.files.length, littleEndian);
    offset += 4;

    pck.files.forEach(f => {
      view.setUint32(offset, f.data.length, littleEndian);
      offset += 4;
      view.setUint32(offset, f.type, littleEndian);
      offset += 4;
      view.setUint32(offset, f.path.length, littleEndian);
      offset += 4;
      const encoded = this.encodeU16(f.path, littleEndian);
      new Uint8Array(buffer, offset, encoded.length).set(encoded);
      offset += encoded.length;
      view.setUint32(offset, 0, littleEndian);
      offset += 4;
    });

    pck.files.forEach(f => {
      view.setUint32(offset, f.properties.length, littleEndian);
      offset += 4;

      f.properties.forEach(p => {
        const propIdx = finalProperties.indexOf(p.key);
        view.setUint32(offset, propIdx, littleEndian);
        offset += 4;
        view.setUint32(offset, p.value.length, littleEndian);
        offset += 4;
        const encoded = this.encodeU16(p.value, littleEndian);
        new Uint8Array(buffer, offset, encoded.length).set(encoded);
        offset += encoded.length;
        view.setUint32(offset, 0, littleEndian);
        offset += 4;
      });

      new Uint8Array(buffer, offset, f.data.length).set(f.data);
      offset += f.data.length;
    });

    return buffer;
  }
}
